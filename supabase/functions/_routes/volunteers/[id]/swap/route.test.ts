import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { POST } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (body: Record<string, unknown>) =>
  new Request('http://test/api/volunteers/1/swap?slug=default', { method: 'POST', body: JSON.stringify(body) })

describe('POST /api/volunteers/[id]/swap', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await POST(req({ newVolunteerId: 2 }), params('1'))).status).toBe(401)
  })

  it('rejects a missing newVolunteerId', async () => {
    expect((await POST(req({}), params('1'))).status).toBe(400)
  })

  it('rejects swapping a volunteer with themselves', async () => {
    const res = await POST(req({ newVolunteerId: 1 }), params('1'))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Cannot swap a volunteer with themselves')
  })

  it('404s when the outgoing volunteer is not in this competition', async () => {
    mock.queueResults([])
    const res = await POST(req({ newVolunteerId: 2 }), params('1'))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Volunteer not found')
  })

  it('404s when the replacement volunteer is not in this competition', async () => {
    mock.queueResults([{ id: 1 }], [])
    const res = await POST(req({ newVolunteerId: 2 }), params('1'))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Replacement volunteer not found')
  })

  it('reports swapped 0 and skips the update when there are no assignments', async () => {
    mock.queueResults([{ id: 1 }], [{ id: 2 }], [])
    const res = await POST(req({ newVolunteerId: 2 }), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ swapped: 0 })
    expect(mock.calls.some(c => c.method === 'update')).toBe(false)
  })

  it('409s when the replacement already judges one of the same heats', async () => {
    mock.queueResults(
      [{ id: 1 }],
      [{ id: 2 }],
      [{ id: 10, workoutId: 5, heatNumber: 1 }, { id: 11, workoutId: 5, heatNumber: 2 }],
      [{ workoutId: 5, heatNumber: 2 }],
    )
    const res = await POST(req({ newVolunteerId: 2 }), params('1'))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Replacement volunteer already has assignments in 1 heat(s)' })
  })

  // The conflict test is per (workoutId, heatNumber) slot, not per workout: the
  // replacement may already judge the same workout in a heat the outgoing
  // volunteer does not cover.
  it('allows the swap when the replacement judges the same workout in a different heat', async () => {
    mock.queueResults(
      [{ id: 1 }],
      [{ id: 2 }],
      [{ id: 10, workoutId: 5, heatNumber: 1 }],
      [{ workoutId: 5, heatNumber: 9 }],
      [],
    )
    const res = await POST(req({ newVolunteerId: 2 }), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ swapped: 1 })
  })

  it('repoints every assignment to the replacement and reports the count', async () => {
    mock.queueResults(
      [{ id: 1 }],
      [{ id: 2 }],
      [{ id: 10, workoutId: 5, heatNumber: 1 }, { id: 11, workoutId: 6, heatNumber: 3 }],
      [],
      [],
    )
    const res = await POST(req({ newVolunteerId: 2 }), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ swapped: 2 })

    expect(mock.calls.some(c => c.method === 'update')).toBe(true)
    expect(mock.calls.find(c => c.method === 'set')!.args[0]).toEqual({ volunteerId: 2 })
  })
})
