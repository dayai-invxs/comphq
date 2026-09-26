import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { GET, POST } from './route'

const getReq = (slug = 'default') => new Request(`http://test/api/volunteer-roles?slug=${slug}`)
const postReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/volunteer-roles', { method: 'POST', body: JSON.stringify(body) })

describe('GET /api/volunteer-roles', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await GET(getReq())).status).toBe(401)
  })

  it('404s when slug is missing', async () => {
    expect((await GET(getReq(''))).status).toBe(404)
  })

  it('returns roles scoped to the competition, ordered by name', async () => {
    const rows = [{ id: 1, name: 'Judge' }, { id: 2, name: 'Scorer' }]
    mock.queueResult({ data: rows, error: null })

    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)

    const call = mock.lastCall!
    expect(call.table).toBe('VolunteerRole')
    expect(call.ops.find(o => o.op === 'select')?.args[0]).toBe('id, name')
    expect(call.ops.find(o => o.op === 'eq')?.args).toEqual(['competitionId', 1])
    expect(call.ops.find(o => o.op === 'order')?.args[0]).toBe('name')
  })

  it('coalesces a null data payload to an empty array', async () => {
    mock.queueResult({ data: null, error: null })
    expect(await (await GET(getReq())).json()).toEqual([])
  })

  it('surfaces a query error as 500 with the driver message', async () => {
    mock.queueResult({ data: null, error: { message: 'boom' } })
    const res = await GET(getReq())
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('boom')
  })
})

describe('POST /api/volunteer-roles', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await POST(postReq({ slug: 'default', name: 'Judge' }))).status).toBe(401)
  })

  // Body parsing runs before the auth gate, so a malformed body is a 400 even
  // for an anonymous caller. Pinning the order, not endorsing it.
  it('validates the body before authenticating', async () => {
    setAuthUser(null)
    expect((await POST(postReq({ slug: 'default', name: '  ' }))).status).toBe(400)
  })

  it('rejects a missing slug', async () => {
    expect((await POST(postReq({ name: 'Judge' }))).status).toBe(400)
  })

  it('inserts against the resolved competition and returns 201', async () => {
    const created = { id: 7, name: 'Judge' }
    mock.queueResult({ data: created, error: null })

    const res = await POST(postReq({ slug: 'default', name: 'Judge' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)

    const call = mock.lastCall!
    expect(call.table).toBe('VolunteerRole')
    expect(call.ops.find(o => o.op === 'insert')!.args[0]).toEqual({ competitionId: 1, name: 'Judge' })
    expect(call.ops.find(o => o.op === 'single')).toBeTruthy()
  })

  it('surfaces an insert error as 500', async () => {
    mock.queueResult({ data: null, error: { message: 'duplicate key' } })
    const res = await POST(postReq({ slug: 'default', name: 'Judge' }))
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('duplicate key')
  })
})
