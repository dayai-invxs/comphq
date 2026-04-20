import { describe, it, expect } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { GET } from './route'

describe('GET /api/ops', () => {
  it('returns workouts with heats grouped and completion flags', async () => {
    mock.queueResults(
      { data: { value: 'true' }, error: null },
      { data: [{ id: 1, number: 1, name: 'WOD', status: 'active', completedHeats: '[1]', startTime: null, heatIntervalSecs: 600, heatStartOverrides: '{}', timeBetweenHeatsSecs: 120, callTimeSecs: 60, walkoutTimeSecs: 30 }], error: null },
      {
        data: [
          { workoutId: 1, athleteId: 1, heatNumber: 1, lane: 1, athlete: { id: 1, name: 'A', bibNumber: null, division: null } },
          { workoutId: 1, athleteId: 2, heatNumber: 2, lane: 1, athlete: { id: 2, name: 'B', bibNumber: null, division: null } },
        ],
        error: null,
      },
    )
    const res = await GET()
    const body = await res.json()
    expect(body.showBib).toBe(true)
    expect(body.workouts).toHaveLength(1)
    expect(body.workouts[0].heats).toHaveLength(2)
    expect(body.workouts[0].heats[0].isComplete).toBe(true)
    expect(body.workouts[0].heats[1].isComplete).toBe(false)
  })
})
