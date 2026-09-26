import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { DELETE } from './route'

const params = (id: string, equipmentId: string) => ({ params: Promise.resolve({ id, equipmentId }) })
const req = () => new Request('http://test/api/workouts/1/equipment/9?slug=default', { method: 'DELETE' })

describe('DELETE /api/workouts/[id]/equipment/[equipmentId]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await DELETE(req(), params('1', '9'))).status).toBe(401)
  })

  it('404s when the workout belongs to another competition', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await DELETE(req(), params('1', '9'))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Not found')
  })

  // Ownership is enforced by first proving the workout is in the competition,
  // then scoping the delete to (equipment id, workout id).
  it('deletes scoped to the equipment id and the workout id', async () => {
    mock.queueResults({ data: { id: 1 }, error: null }, { data: null, error: null })
    const res = await DELETE(req(), params('1', '9'))
    expect(res.status).toBe(204)

    const call = mock.lastCall!
    expect(call.table).toBe('WorkoutEquipment')
    expect(call.ops.find(o => o.op === 'delete')).toBeTruthy()
    expect(call.ops.filter(o => o.op === 'eq').map(o => o.args)).toEqual([['id', 9], ['workoutId', 1]])
  })

  it('surfaces a delete error as 500', async () => {
    mock.queueResults({ data: { id: 1 }, error: null }, { data: null, error: { message: 'boom' } })
    expect((await DELETE(req(), params('1', '9'))).status).toBe(500)
  })
})
