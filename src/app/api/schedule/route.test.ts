import { describe, it, expect } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { GET } from './route'

describe('GET /api/schedule', () => {
  it('returns showBib default true and empty workouts when none active', async () => {
    mock.queueResults(
      { data: null, error: null },
      { data: [], error: null },
    )
    const res = await GET(new Request('http://test/api/schedule?slug=default'))
    const body = await res.json()
    expect(body.showBib).toBe(true)
    expect(body.workouts).toEqual([])
  })

  it('hides completed heats from schedule and returns entries per remaining heat', async () => {
    mock.queueResults(
      { data: { value: 'false' }, error: null },
      { data: [{ id: 1, number: 1, name: 'WOD', status: 'active', completedHeats: '[1]', startTime: '2026-01-01T10:00:00Z', heatIntervalSecs: 600, heatStartOverrides: '{}', timeBetweenHeatsSecs: 120, callTimeSecs: 60, walkoutTimeSecs: 30 }], error: null },
      {
        data: [
          { id: 10, workoutId: 1, athleteId: 1, heatNumber: 1, lane: 1, athlete: { id: 1, name: 'Alice', bibNumber: null, division: null } },
          { id: 11, workoutId: 1, athleteId: 2, heatNumber: 2, lane: 1, athlete: { id: 2, name: 'Bob', bibNumber: '9', division: { id: 1, name: 'Rx', order: 0 } } },
        ],
        error: null,
      },
    )
    const res = await GET(new Request('http://test/api/schedule?slug=default'))
    const body = await res.json()
    expect(body.showBib).toBe(false)
    expect(body.workouts).toHaveLength(1)
    expect(body.workouts[0].schedule).toHaveLength(1)
    expect(body.workouts[0].schedule[0].athleteName).toBe('Bob')
    expect(body.workouts[0].schedule[0].divisionName).toBe('Rx')
  })
})
