import { describe, it, expect } from 'vitest'
import { drizzleMock as mock } from '@/test/setup'
import { GET } from './route'

const getReq = () => new Request('http://test/api/leaderboard?slug=default')

describe('GET /api/leaderboard', () => {
  it('returns empty entries when no data', async () => {
    mock.queueResults([], [], [], [])
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.workouts).toEqual([])
    expect(body.entries).toEqual([])
  })

  it('sums points across completed workouts and sorts by total', async () => {
    const workouts = [
      {
        id: 10, number: 1, name: 'A', scoreType: 'time', status: 'completed',
        tiebreakEnabled: false, tiebreakScoreType: 'time', halfWeight: false,
        competitionId: 1, lanes: 10, heatIntervalSecs: 0, timeBetweenHeatsSecs: 0,
        callTimeSecs: 0, walkoutTimeSecs: 0, startTime: null, mixedHeats: false,
        partBEnabled: false, partBScoreType: 'time',
        heatStartOverrides: '{}', locationId: null,
      },
      {
        id: 11, number: 2, name: 'B', scoreType: 'time', status: 'completed',
        tiebreakEnabled: false, tiebreakScoreType: 'time', halfWeight: false,
        competitionId: 1, lanes: 10, heatIntervalSecs: 0, timeBetweenHeatsSecs: 0,
        callTimeSecs: 0, walkoutTimeSecs: 0, startTime: null, mixedHeats: false,
        partBEnabled: false, partBScoreType: 'time',
        heatStartOverrides: '{}', locationId: null,
      },
    ]
    const athletes = [
      { id: 1, name: 'Alice', divisionName: null },
      { id: 2, name: 'Bob', divisionName: 'Rx' },
    ]
    const scores = [
      { athleteId: 1, workoutId: 10, points: 1, rawScore: 100, tiebreakRawScore: null },
      { athleteId: 1, workoutId: 11, points: 1, rawScore: 90, tiebreakRawScore: null },
      { athleteId: 2, workoutId: 10, points: 2, rawScore: 110, tiebreakRawScore: null },
      { athleteId: 2, workoutId: 11, points: 2, rawScore: 95, tiebreakRawScore: null },
    ]

    // Shift order: readSetting helpers inside Promise.all run synchronously
    // at array-evaluation time (the async fn body executes to its first await),
    // so they shift results BEFORE Promise.all iterates the outer items.
    //   1-3. readSetting('tiebreakWorkoutId'), readSetting('tvLeaderboardPercentages'), readSetting('tvLeaderboardOrder')
    //   4-6. workouts + athletes + divisions (Promise.all iteration calls .then)
    //   7. scores (post-Promise.all)
    mock.queueResults([], [], [], workouts, athletes, [], scores)

    const res = await GET(getReq())
    const body = await res.json()
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0].athleteName).toBe('Alice')
    expect(body.entries[0].totalPoints).toBe(2)
    expect(body.entries[1].athleteName).toBe('Bob')
    expect(body.entries[1].totalPoints).toBe(4)
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=5/)
  })
})
