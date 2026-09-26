import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { PUT, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const putReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/workout-locations/1?slug=default', { method: 'PUT', body: JSON.stringify(body) })
const deleteReq = () => new Request('http://test/api/workout-locations/1?slug=default')

describe('PUT /api/workout-locations/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await PUT(putReq({ name: 'Rig' }), params('1'))).status).toBe(401)
  })

  it('rejects an empty name', async () => {
    expect((await PUT(putReq({ name: '' }), params('1'))).status).toBe(400)
  })

  it('updates the row scoped to id and competitionId', async () => {
    mock.queueResult({ data: { id: 1, name: 'Rig' }, error: null })
    const res = await PUT(putReq({ name: 'Rig' }), params('1'))
    expect(res.status).toBe(200)

    const call = mock.lastCall!
    expect(call.table).toBe('WorkoutLocation')
    expect(call.ops.find(o => o.op === 'update')!.args[0]).toEqual({ name: 'Rig' })
    expect(call.ops.filter(o => o.op === 'eq').map(o => o.args)).toEqual([['id', 1], ['competitionId', 1]])
    expect(call.ops.find(o => o.op === 'maybeSingle')).toBeTruthy()
  })

  it('404s when no row matched', async () => {
    mock.queueResult({ data: null, error: null })
    expect((await PUT(putReq({ name: 'Rig' }), params('1'))).status).toBe(404)
  })

  it('surfaces an update error as 500', async () => {
    mock.queueResult({ data: null, error: { message: 'nope' } })
    expect((await PUT(putReq({ name: 'Rig' }), params('1'))).status).toBe(500)
  })
})

describe('DELETE /api/workout-locations/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await DELETE(deleteReq(), params('1'))).status).toBe(401)
  })

  it('deletes scoped to id and competitionId and returns 204', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await DELETE(deleteReq(), params('2'))
    expect(res.status).toBe(204)

    const call = mock.lastCall!
    expect(call.table).toBe('WorkoutLocation')
    expect(call.ops.find(o => o.op === 'delete')).toBeTruthy()
    expect(call.ops.filter(o => o.op === 'eq').map(o => o.args)).toEqual([['id', 2], ['competitionId', 1]])
  })

  it('surfaces a delete error as 500', async () => {
    mock.queueResult({ data: null, error: { message: 'fk violation' } })
    expect((await DELETE(deleteReq(), params('1'))).status).toBe(500)
  })
})
