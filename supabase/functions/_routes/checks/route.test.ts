import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { GET, PATCH } from './route'

const getReq = (slug = 'default') => new Request(`http://test/api/checks?slug=${slug}`)
const patchReq = (body: unknown) =>
  new Request('http://test/api/checks', { method: 'PATCH', body: JSON.stringify(body) })

describe('GET /api/checks', () => {
  // DEFECT (v1, ported as-is): this route has no auth gate at all. Anyone who
  // knows a slug can read and write check state. Locked here so the port is
  // verifiable; tracked separately for a fix.
  it('serves an anonymous caller', async () => {
    setAuthUser(null)
    mock.queueResults([], [])
    expect((await GET(getReq())).status).toBe(200)
  })

  it('404s when the slug does not resolve', async () => {
    expect((await GET(getReq(''))).status).toBe(404)
  })

  it('defaults both maps to empty objects when no settings rows exist', async () => {
    mock.queueResults([], [])
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ athleteChecks: {}, equipChecks: {} })
  })

  it('parses the stored JSON for each map', async () => {
    mock.queueResults(
      [{ value: '{"12":true}' }],
      [{ value: '{"barbell":false}' }],
    )
    expect(await (await GET(getReq())).json())
      .toEqual({ athleteChecks: { '12': true }, equipChecks: { barbell: false } })
  })

  // Corrupt stored JSON degrades to the empty default rather than 500ing.
  it('falls back to an empty map when stored JSON is unparseable', async () => {
    mock.queueResults([{ value: 'not json' }], [{ value: '{"a":1}' }])
    expect(await (await GET(getReq())).json())
      .toEqual({ athleteChecks: {}, equipChecks: { a: 1 } })
  })
})

describe('PATCH /api/checks', () => {
  it('serves an anonymous caller', async () => {
    setAuthUser(null)
    mock.queueResults([])
    expect((await PATCH(patchReq({ slug: 'default', type: 'athlete', checks: {} }))).status).toBe(204)
  })

  it('400s on malformed JSON', async () => {
    const req = new Request('http://test/api/checks', { method: 'PATCH', body: '{' })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Invalid JSON')
  })

  it('400s on an unknown type', async () => {
    const res = await PATCH(patchReq({ slug: 'default', type: 'judge', checks: {} }))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Invalid request')
  })

  // An empty slug is caught by the schema's min(1) before the competition
  // lookup, so it is a 400 here where GET returns 404 for the same input.
  it('400s on an empty slug', async () => {
    expect((await PATCH(patchReq({ slug: '', type: 'athlete', checks: {} }))).status).toBe(400)
  })

  it('writes the athlete map under the athleteChecks key', async () => {
    mock.queueResults([])
    const res = await PATCH(patchReq({ slug: 'default', type: 'athlete', checks: { '12': true } }))
    expect(res.status).toBe(204)
    expect(mock.calls.find(c => c.method === 'values')!.args[0])
      .toEqual({ competitionId: 1, key: 'athleteChecks', value: '{"12":true}' })
  })

  // 'equipment' in the request body maps to the 'equipChecks' setting key.
  it('writes the equipment map under the equipChecks key', async () => {
    mock.queueResults([])
    await PATCH(patchReq({ slug: 'default', type: 'equipment', checks: { barbell: 3 } }))
    expect(mock.calls.find(c => c.method === 'values')!.args[0])
      .toEqual({ competitionId: 1, key: 'equipChecks', value: '{"barbell":3}' })
  })

  // COM-116. A tick sends one entry, merged into the stored map inside the
  // upsert, so two ticks racing from one phone or two never overwrite each
  // other with an older copy of the whole map.
  it('merges a single entry into the stored map in the database', async () => {
    mock.queueResults([])
    const entry = { key: '7-1', value: { corral: true, walkout: false } }
    const res = await PATCH(patchReq({ slug: 'default', type: 'athlete', entry }))
    expect(res.status).toBe(204)
    expect(mock.calls.find(c => c.method === 'values')!.args[0])
      .toEqual({ competitionId: 1, key: 'athleteChecks', value: '{"7-1":{"corral":true,"walkout":false}}' })
    const conflict = mock.calls.find(c => c.method === 'onConflictDoUpdate')!.args[0] as { set: { value: SQL } }
    const { sql, params } = new PgDialect().sqlToQuery(conflict.set.value)
    expect(sql).toMatch(/::jsonb \|\| .*::jsonb/)
    expect(params).toContain('{"7-1":{"corral":true,"walkout":false}}')
  })

  it('400s when both a whole map and an entry are sent', async () => {
    const body = { slug: 'default', type: 'athlete', checks: {}, entry: { key: '7-1', value: true } }
    expect((await PATCH(patchReq(body))).status).toBe(400)
  })

  it('400s when neither a whole map nor an entry is sent', async () => {
    expect((await PATCH(patchReq({ slug: 'default', type: 'athlete' }))).status).toBe(400)
  })

  it('upserts on (competitionId, key) rather than inserting a duplicate', async () => {
    mock.queueResults([])
    await PATCH(patchReq({ slug: 'default', type: 'athlete', checks: {} }))
    expect(mock.calls.some(c => c.method === 'onConflictDoUpdate')).toBe(true)
  })
})
