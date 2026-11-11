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

  it('sends a secret workout that is not active yet as only its number, named TBA', async () => {
    const base = {
      startTime: null, heatIntervalSecs: 600, heatStartOverrides: '{}', timeBetweenHeatsSecs: 120,
      callTimeSecs: 60, walkoutTimeSecs: 30, scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time',
    }
    mock.queueResults(
      [{ value: 'true' }],
      [
        { ...base, id: 1, number: 1, name: 'WOD', status: 'active', secret: true, locationName: null },
        { ...base, id: 4, number: 4, name: 'The Surprise', status: 'draft', secret: true, locationName: 'Pool' },
      ],
      [],
      [{ workoutId: 4, athleteId: 1, heatNumber: 1, lane: 1, athleteName: 'A', bibNumber: null, divisionName: null }],
      [],
    )
    const body = await (await GET(new Request('http://test/api/ops?slug=default'))).json()
    expect(body.workouts[0]).toMatchObject({ name: 'WOD', tba: false })
    expect(body.workouts[1]).toMatchObject({ id: 4, number: 4, name: 'TBA', tba: true, locationName: null, heats: [] })
    expect(JSON.stringify(body)).not.toMatch(/Surprise|Pool/)
  })

  // A schedule drops a knockout round the tournament has moved past, so it
  // needs to know the workout is a knockout and which round each heat is.
  it('marks a knockout workout and gives each of its heats a round', async () => {
    const base = {
      startTime: null, heatIntervalSecs: 600, heatStartOverrides: '{}', timeBetweenHeatsSecs: 120,
      callTimeSecs: 60, walkoutTimeSecs: 30, scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time',
      status: 'active', locationName: null,
    }
    mock.queueResults(
      [{ value: 'false' }],
      [
        { ...base, id: 1, number: 1, name: 'Sprint', knockout: true },
        { ...base, id: 2, number: 2, name: 'Fran', knockout: false },
      ],
      [],
      [
        // An imported heat has no round: it is round 1.
        { workoutId: 1, athleteId: 1, heatNumber: 1, lane: 1, round: null, athleteName: 'A', bibNumber: null, divisionName: null },
        { workoutId: 1, athleteId: 1, heatNumber: 2, lane: 1, round: 2, athleteName: 'A', bibNumber: null, divisionName: null },
        { workoutId: 2, athleteId: 1, heatNumber: 1, lane: 1, round: null, athleteName: 'A', bibNumber: null, divisionName: null },
      ],
      [],
    )
    const body = await (await GET(new Request('http://test/api/ops?slug=default'))).json()
    expect(body.workouts[0].knockout).toBe(true)
    expect(body.workouts[0].heats.map((h: { round: number }) => h.round)).toEqual([1, 2])
    expect(body.workouts[1].knockout).toBe(false)
    expect(body.workouts[1].heats[0]).not.toHaveProperty('round')
  })
})

