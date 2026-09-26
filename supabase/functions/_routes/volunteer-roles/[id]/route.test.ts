import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { PUT, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const putReq = (body: Record<string, unknown>, slug = 'default') =>
  new Request(`http://test/api/volunteer-roles/1?slug=${slug}`, { method: 'PUT', body: JSON.stringify(body) })
const deleteReq = (slug = 'default') => new Request(`http://test/api/volunteer-roles/1?slug=${slug}`)

describe('PUT /api/volunteer-roles/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await PUT(putReq({ name: 'Judge' }), params('1'))).status).toBe(401)
  })

  it('rejects an empty name', async () => {
    expect((await PUT(putReq({ name: '  ' }), params('1'))).status).toBe(400)
  })

  it('updates the row scoped to id and competitionId', async () => {
    mock.queueResult({ data: { id: 1, name: 'Head Judge' }, error: null })
    const res = await PUT(putReq({ name: 'Head Judge' }), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 1, name: 'Head Judge' })

    const call = mock.lastCall!
    expect(call.table).toBe('VolunteerRole')
    expect(call.ops.find(o => o.op === 'update')!.args[0]).toEqual({ name: 'Head Judge' })
    expect(call.ops.filter(o => o.op === 'eq').map(o => o.args)).toEqual([['id', 1], ['competitionId', 1]])
    expect(call.ops.find(o => o.op === 'maybeSingle')).toBeTruthy()
  })

  it('coerces a non-numeric id to NaN rather than rejecting it', async () => {
    mock.queueResult({ data: null, error: null })
    await PUT(putReq({ name: 'X' }), params('abc'))
    expect(mock.lastCall!.ops.find(o => o.op === 'eq')!.args[1]).toBeNaN()
  })

  it('404s when no row matched', async () => {
    mock.queueResult({ data: null, error: null })
    expect((await PUT(putReq({ name: 'X' }), params('1'))).status).toBe(404)
  })

  it('surfaces an update error as 500', async () => {
    mock.queueResult({ data: null, error: { message: 'nope' } })
    expect((await PUT(putReq({ name: 'X' }), params('1'))).status).toBe(500)
  })
})

describe('DELETE /api/volunteer-roles/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await DELETE(deleteReq(), params('1'))).status).toBe(401)
  })

  it('deletes scoped to id and competitionId and returns 204', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await DELETE(deleteReq(), params('3'))
    expect(res.status).toBe(204)

    const call = mock.lastCall!
    expect(call.table).toBe('VolunteerRole')
    expect(call.ops.find(o => o.op === 'delete')).toBeTruthy()
    expect(call.ops.filter(o => o.op === 'eq').map(o => o.args)).toEqual([['id', 3], ['competitionId', 1]])
  })

  // Deleting a row that does not exist is a no-op 204, not a 404.
  it('returns 204 even when nothing matched', async () => {
    mock.queueResult({ data: [], error: null })
    expect((await DELETE(deleteReq(), params('999'))).status).toBe(204)
  })

  it('surfaces a delete error as 500', async () => {
    mock.queueResult({ data: null, error: { message: 'fk violation' } })
    const res = await DELETE(deleteReq(), params('1'))
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('fk violation')
  })
})
