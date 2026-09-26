import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { PUT, DELETE } from './route'

const WITH_ROLE = '*, role:VolunteerRole(id, name)'
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const putReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/volunteers/1?slug=default', { method: 'PUT', body: JSON.stringify(body) })
const deleteReq = () => new Request('http://test/api/volunteers/1?slug=default')

describe('PUT /api/volunteers/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await PUT(putReq({ name: 'Ann' }), params('1'))).status).toBe(401)
  })

  it('rejects an empty name', async () => {
    expect((await PUT(putReq({ name: '' }), params('1'))).status).toBe(400)
  })

  // roleId is optional in the schema but always written, so omitting it
  // clears an existing role rather than leaving it untouched.
  it('writes roleId null when the field is omitted', async () => {
    mock.queueResult({ data: { id: 1, name: 'Ann', roleId: null, role: null }, error: null })
    await PUT(putReq({ name: 'Ann' }), params('1'))
    expect(mock.lastCall!.ops.find(o => o.op === 'update')!.args[0])
      .toEqual({ name: 'Ann', roleId: null })
  })

  it('updates name and roleId scoped to id and competitionId', async () => {
    const updated = { id: 1, name: 'Ann', roleId: 2, role: { id: 2, name: 'Judge' } }
    mock.queueResult({ data: updated, error: null })

    const res = await PUT(putReq({ name: 'Ann', roleId: 2 }), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(updated)

    const call = mock.lastCall!
    expect(call.table).toBe('Volunteer')
    expect(call.ops.find(o => o.op === 'update')!.args[0]).toEqual({ name: 'Ann', roleId: 2 })
    expect(call.ops.filter(o => o.op === 'eq').map(o => o.args)).toEqual([['id', 1], ['competitionId', 1]])
    expect(call.ops.find(o => o.op === 'select')!.args[0]).toBe(WITH_ROLE)
  })

  it('404s when no row matched', async () => {
    mock.queueResult({ data: null, error: null })
    expect((await PUT(putReq({ name: 'Ann' }), params('1'))).status).toBe(404)
  })

  it('surfaces an update error as 500', async () => {
    mock.queueResult({ data: null, error: { message: 'nope' } })
    expect((await PUT(putReq({ name: 'Ann' }), params('1'))).status).toBe(500)
  })
})

describe('DELETE /api/volunteers/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await DELETE(deleteReq(), params('1'))).status).toBe(401)
  })

  it('deletes scoped to id and competitionId and returns 204', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await DELETE(deleteReq(), params('5'))
    expect(res.status).toBe(204)

    const call = mock.lastCall!
    expect(call.table).toBe('Volunteer')
    expect(call.ops.find(o => o.op === 'delete')).toBeTruthy()
    expect(call.ops.filter(o => o.op === 'eq').map(o => o.args)).toEqual([['id', 5], ['competitionId', 1]])
  })

  it('surfaces a delete error as 500', async () => {
    mock.queueResult({ data: null, error: { message: 'fk violation' } })
    expect((await DELETE(deleteReq(), params('1'))).status).toBe(500)
  })
})
