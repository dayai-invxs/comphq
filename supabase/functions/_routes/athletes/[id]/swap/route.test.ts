import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { POST } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (body: Record<string, unknown>) =>
  new Request('http://test/api/athletes/1/swap?slug=default', { method: 'POST', body: JSON.stringify(body) })

describe('POST /api/athletes/[id]/swap', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await POST(req({ newAthleteId: 2 }), params('1'))).status).toBe(401)
  })

  it('rejects a missing newAthleteId', async () => {
    expect((await POST(req({}), params('1'))).status).toBe(400)
  })

  it('rejects swapping an athlete with themselves', async () => {
    const res = await POST(req({ newAthleteId: 1 }), params('1'))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Cannot swap an athlete with themselves')
  })

  it('404s when the outgoing athlete is not in this competition', async () => {
    mock.queueResults([])
    const res = await POST(req({ newAthleteId: 2 }), params('1'))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Athlete not found')
  })

  it('404s when the replacement athlete is not in this competition', async () => {
    mock.queueResults([{ id: 1 }], [])
    const res = await POST(req({ newAthleteId: 2 }), params('1'))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Replacement athlete not found')
  })

  it('reports swapped 0 and skips the update when there are no assignments', async () => {
    mock.queueResults([{ id: 1 }], [{ id: 2 }], [])
    const res = await POST(req({ newAthleteId: 2 }), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ swapped: 0 })
    expect(mock.calls.some(c => c.method === 'update')).toBe(false)
  })

  // Unlike the volunteer swap, the athlete conflict test is per workout — any
  // existing assignment of the replacement in an affected workout blocks it,
  // whatever heat it sits in.
  it('409s when the replacement already races in an affected workout', async () => {
    mock.queueResults(
      [{ id: 1 }],
      [{ id: 2 }],
      [{ id: 10, workoutId: 5 }, { id: 11, workoutId: 6 }],
      [{ workoutId: 5 }],
    )
    const res = await POST(req({ newAthleteId: 2 }), params('1'))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Replacement athlete already has heat assignments in 1 workout(s)' })
  })

  it('repoints every assignment to the replacement and reports the count', async () => {
    mock.queueResults(
      [{ id: 1 }],
      [{ id: 2 }],
      [{ id: 10, workoutId: 5 }, { id: 11, workoutId: 6 }],
      [],
      [],
    )
    const res = await POST(req({ newAthleteId: 2 }), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ swapped: 2 })

    expect(mock.calls.some(c => c.method === 'update')).toBe(true)
    expect(mock.calls.find(c => c.method === 'set')!.args[0]).toEqual({ athleteId: 2 })
  })

  // Scores are keyed on athleteId and are deliberately left alone: the swap
  // moves lane slots only.
  it('leaves scores untouched', async () => {
    mock.queueResults([{ id: 1 }], [{ id: 2 }], [{ id: 10, workoutId: 5 }], [], [])
    await POST(req({ newAthleteId: 2 }), params('1'))
    const sets = mock.calls.filter(c => c.method === 'set').map(c => c.args[0])
    expect(sets).toEqual([{ athleteId: 2 }])
  })
})
