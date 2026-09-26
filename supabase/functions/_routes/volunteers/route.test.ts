import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { GET, POST, DELETE } from './route'

const WITH_ROLE = '*, role:VolunteerRole(id, name)'

const getReq = (slug = 'default') => new Request(`http://test/api/volunteers?slug=${slug}`)
const postReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/volunteers', { method: 'POST', body: JSON.stringify(body) })
const deleteReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/volunteers', { method: 'DELETE', body: JSON.stringify(body) })

describe('GET /api/volunteers', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await GET(getReq())).status).toBe(401)
  })

  it('404s when slug is missing', async () => {
    expect((await GET(getReq(''))).status).toBe(404)
  })

  it('embeds the role relation and orders by name', async () => {
    const rows = [{ id: 1, name: 'Ann', roleId: 2, role: { id: 2, name: 'Judge' } }]
    mock.queueResult({ data: rows, error: null })

    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)

    const call = mock.lastCall!
    expect(call.table).toBe('Volunteer')
    expect(call.ops.find(o => o.op === 'select')!.args[0]).toBe(WITH_ROLE)
    expect(call.ops.find(o => o.op === 'eq')!.args).toEqual(['competitionId', 1])
    expect(call.ops.find(o => o.op === 'order')!.args[0]).toBe('name')
  })

  it('coalesces a null data payload to an empty array', async () => {
    mock.queueResult({ data: null, error: null })
    expect(await (await GET(getReq())).json()).toEqual([])
  })

  it('surfaces a query error as 500', async () => {
    mock.queueResult({ data: null, error: { message: 'boom' } })
    expect((await GET(getReq())).status).toBe(500)
  })
})

describe('POST /api/volunteers', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await POST(postReq({ slug: 'default', name: 'Ann' }))).status).toBe(401)
  })

  it('rejects an empty name', async () => {
    expect((await POST(postReq({ slug: 'default', name: ' ' }))).status).toBe(400)
  })

  it('defaults an omitted roleId to null', async () => {
    mock.queueResult({ data: { id: 1, name: 'Ann', roleId: null, role: null }, error: null })
    const res = await POST(postReq({ slug: 'default', name: 'Ann' }))
    expect(res.status).toBe(201)
    expect(mock.lastCall!.ops.find(o => o.op === 'insert')!.args[0])
      .toEqual({ competitionId: 1, name: 'Ann', roleId: null })
  })

  it('inserts with the supplied roleId and embeds the role in the response', async () => {
    const created = { id: 1, name: 'Ann', roleId: 2, role: { id: 2, name: 'Judge' } }
    mock.queueResult({ data: created, error: null })

    const res = await POST(postReq({ slug: 'default', name: 'Ann', roleId: 2 }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)

    const call = mock.lastCall!
    expect(call.ops.find(o => o.op === 'insert')!.args[0])
      .toEqual({ competitionId: 1, name: 'Ann', roleId: 2 })
    expect(call.ops.find(o => o.op === 'select')!.args[0]).toBe(WITH_ROLE)
  })

  it('surfaces an insert error as 500', async () => {
    mock.queueResult({ data: null, error: { message: 'nope' } })
    expect((await POST(postReq({ slug: 'default', name: 'Ann' }))).status).toBe(500)
  })
})

describe('DELETE /api/volunteers (bulk)', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await DELETE(deleteReq({ slug: 'default', ids: [1] }))).status).toBe(401)
  })

  it('rejects an empty id list', async () => {
    expect((await DELETE(deleteReq({ slug: 'default', ids: [] }))).status).toBe(400)
  })

  it('rejects more than 500 ids', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => i + 1)
    expect((await DELETE(deleteReq({ slug: 'default', ids }))).status).toBe(400)
  })

  it('deletes the listed ids scoped to the competition and reports the count', async () => {
    mock.queueResult({ data: [{ id: 1 }, { id: 2 }], error: null })
    const res = await DELETE(deleteReq({ slug: 'default', ids: [1, 2, 3] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 2 })

    const call = mock.lastCall!
    expect(call.table).toBe('Volunteer')
    expect(call.ops.find(o => o.op === 'in')!.args).toEqual(['id', [1, 2, 3]])
    expect(call.ops.find(o => o.op === 'eq')!.args).toEqual(['competitionId', 1])
  })

  // The count comes from the returned rows, not from the requested ids, so
  // ids belonging to another competition silently drop out of the total.
  it('reports 0 when a null payload comes back', async () => {
    mock.queueResult({ data: null, error: null })
    expect(await (await DELETE(deleteReq({ slug: 'default', ids: [1] }))).json()).toEqual({ deleted: 0 })
  })

  it('surfaces a delete error as 500', async () => {
    mock.queueResult({ data: null, error: { message: 'fk violation' } })
    expect((await DELETE(deleteReq({ slug: 'default', ids: [1] }))).status).toBe(500)
  })
})
