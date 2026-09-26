import { describe, it, expect } from 'vitest'
import { drizzleMock as mock } from '@/test/setup'
import { GET } from './route'

describe('GET /api/schedule', () => {
  it('returns showBib default true and empty workouts when none active', async () => {
    mock.queueResults(
      [], // showBib setting (no row → default true)
      [], // workouts (no active)
    )
    const res = await GET(new Request('http://test/api/schedule?slug=default'))
    const body = await res.json()
    expect(body.showBib).toBe(true)
    expect(body.workouts).toEqual([])
  })

  it('hides completed heats from schedule and returns entries per remaining heat', async () => {
    // Shift order:
    //   1. showBib
    //   2. active workouts
    //   3. heatCompletion (getCompletedHeatsByWorkout helper fires during
    //      Promise.all array evaluation)
    //   4. assignments (Promise.all proxy iteration)
    mock.queueResults(
      [{ value: 'false' }],
      [{
        id: 1, number: 1, name: 'WOD', startTime: '2026-01-01T10:00:00Z',
        heatIntervalSecs: 600, heatStartOverrides: '{}', timeBetweenHeatsSecs: 120,
        callTimeSecs: 60, walkoutTimeSecs: 30,
      }],
      [{ workoutId: 1, heatNumber: 1 }], // heatCompletion
      [
        { workoutId: 1, athleteId: 1, heatNumber: 1, lane: 1, athleteName: 'Alice', bibNumber: null, divisionName: null },
        { workoutId: 1, athleteId: 2, heatNumber: 2, lane: 1, athleteName: 'Bob', bibNumber: '9', divisionName: 'Rx' },
      ],
    )
    const res = await GET(new Request('http://test/api/schedule?slug=default'))
    const body = await res.json()
    expect(body.showBib).toBe(false)
    expect(body.workouts).toHaveLength(1)
    expect(body.workouts[0].schedule).toHaveLength(1)
    expect(body.workouts[0].schedule[0].athleteName).toBe('Bob')
    expect(body.workouts[0].schedule[0].divisionName).toBe('Rx')
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=5/)
  })
})
