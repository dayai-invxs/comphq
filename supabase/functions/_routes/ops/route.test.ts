import { describe, it, expect } from 'vitest'
import { drizzleMock as mock } from '@/test/setup'
import { GET } from './route'

describe('GET /api/ops', () => {
  it('returns workouts with heats grouped and completion flags', async () => {
    // Shift order:
    //   1. showBib setting (sequential await)
    //   2. workouts (sequential await)
    //   3. heatCompletion (inside Promise.all, getCompletedHeatsByWorkout
    //      helper shifts at array-evaluation time)
    //   4-5. assignments, scores (Promise.all iterates the proxies)
    mock.queueResults(
      [{ value: 'true' }],
      [{
        id: 1, number: 1, name: 'WOD', status: 'active', startTime: null,
        heatIntervalSecs: 600, heatStartOverrides: '{}', timeBetweenHeatsSecs: 120,
        callTimeSecs: 60, walkoutTimeSecs: 30, scoreType: 'time',
        tiebreakEnabled: false, tiebreakScoreType: 'time', locationName: null,
      }],
      [{ workoutId: 1, heatNumber: 1 }], // heatCompletion
      [
        { workoutId: 1, athleteId: 1, heatNumber: 1, lane: 1, athleteName: 'A', bibNumber: null, divisionName: null },
        { workoutId: 1, athleteId: 2, heatNumber: 2, lane: 1, athleteName: 'B', bibNumber: null, divisionName: null },
      ],
      [], // scores
    )
    const res = await GET(new Request('http://test/api/ops?slug=default'))
    const body = await res.json()
    expect(body.showBib).toBe(true)
    expect(body.workouts).toHaveLength(1)
    expect(body.workouts[0].heats).toHaveLength(2)
    expect(body.workouts[0].heats[0].isComplete).toBe(true)
    expect(body.workouts[0].heats[1].isComplete).toBe(false)
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=5/)
  })
})
