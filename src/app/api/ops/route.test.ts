import { describe, it, expect } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { GET } from './route'

describe('GET /api/ops', () => {
  it('returns workouts with heats grouped and completion flags', async () => {
    mock.queueResults(
      // 1. showBib setting
      { data: { value: 'true' }, error: null },
      // 2. workouts
      { data: [{ id: 1, number: 1, name: 'WOD', status: 'active', startTime: null, heatIntervalSecs: 600, heatStartOverrides: '{}', timeBetweenHeatsSecs: 120, callTimeSecs: 60, walkoutTimeSecs: 30 }], error: null },
      // 3. getCompletedHeatsByWorkout (async fn body runs first in Promise.all)
      { data: [{ workoutId: 1, heatNumber: 1 }], error: null },
      // 4. assignments select
      {
        data: [
          { workoutId: 1, athleteId: 1, heatNumber: 1, lane: 1, athlete: { id: 1, name: 'A', bibNumber: null, division: null } },
          { workoutId: 1, athleteId: 2, heatNumber: 2, lane: 1, athlete: { id: 2, name: 'B', bibNumber: null, division: null } },
        ],
        error: null,
      },
    )
    const res = await GET(new Request('http://test/api/ops?slug=default'))
    const body = await res.json()
    expect(body.showBib).toBe(true)
    expect(body.workouts).toHaveLength(1)
    expect(body.workouts[0].heats).toHaveLength(2)
    expect(body.workouts[0].heats[0].isComplete).toBe(true)
    expect(body.workouts[0].heats[1].isComplete).toBe(false)
  })
})
