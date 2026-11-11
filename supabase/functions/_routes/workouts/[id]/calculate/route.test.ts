import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { POST } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = () => new Request('http://test/api/workouts/1/calculate?slug=default', { method: 'POST' })

describe('POST /api/workouts/[id]/calculate', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await POST(req(), params('1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when workout not in caller competition', async () => {
    mock.queueResult([]) // requireWorkoutInCompetition finds no row
    const res = await POST(req(), params('99'))
    expect(res.status).toBe(404)
  })

  it('ranks scores, updates points, marks workout completed', async () => {
    // Query order:
    // 1. requireWorkoutInCompetition (Workout select)
    // 2. Score select
    // 3. rankAndPersist → insert-onConflict
    // 4. Workout update → status: 'completed'
    mock.queueResult([{
      id: 1, scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time',
      partBEnabled: false, partBScoreType: 'time',
    }])
    mock.queueResult([
      { athleteId: 1, workoutId: 1, rawScore: 100, tiebreakRawScore: null, partBRawScore: null },
      { athleteId: 2, workoutId: 1, rawScore: 90, tiebreakRawScore: null, partBRawScore: null },
    ])
    mock.queueResult(undefined) // insert onConflict
    mock.queueResult([{ heatNumber: 1 }, { heatNumber: 2 }]) // the workout's heats
    mock.queueResult(undefined) // heats completed
    mock.queueResult(undefined) // workout status update

    const res = await POST(req(), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'Rankings calculated', count: 2 })

    // Final mutation is the status update → expect a set({ status: 'completed' }) call.
    const setCalls = mock.calls.filter((c) => c.method === 'set')
    const statusSet = setCalls.find((c) => (c.args[0] as { status?: string }).status === 'completed')
    expect(statusSet).toBeTruthy()
  })

  it('completes every heat of the workout', async () => {
    mock.queueResults(
      [{ id: 1, scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time', partBEnabled: false, partBScoreType: 'time' }],
      [{ athleteId: 1, workoutId: 1, rawScore: 100, tiebreakRawScore: null, partBRawScore: null }],
      undefined,
      [{ heatNumber: 2 }, { heatNumber: 1 }, { heatNumber: 2 }, { heatNumber: 3 }], // one row per lane
      undefined,
      undefined,
    )
    expect((await POST(req(), params('1'))).status).toBe(200)
    const values = mock.calls.filter((c) => c.method === 'values').map((c) => c.args[0])
    expect(values).toContainEqual([
      { workoutId: 1, heatNumber: 1 },
      { workoutId: 1, heatNumber: 2 },
      { workoutId: 1, heatNumber: 3 },
    ])
    expect(mock.calls.some((c) => c.method === 'onConflictDoNothing')).toBe(true)
  })
})

