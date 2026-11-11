import { describe, it, expect } from 'vitest'
import { drizzleMock as mock } from '@/test/setup'
import { GET } from './route'

const getReq = () => new Request('http://test/api/leaderboard?slug=default')

describe('GET /api/leaderboard', () => {
  it('returns empty entries when no data', async () => {
    mock.queueResults([], [], [], [], [])
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.workouts).toEqual([])
    expect(body.entries).toEqual([])
    expect(body.tvSecondsPerScreen).toBe(10)
  })

  // The TV reads its pace here with the other TV settings, so a change on the
  // Setup screen reaches the board on its next read.
  it('carries the TV pace the competition saved', async () => {
    mock.queueResults([], [], [], [], [{ value: '30' }])
    const body = await (await GET(getReq())).json()
    expect(body.tvSecondsPerScreen).toBe(30)
  })

  it('falls back to the default pace for a stored value it cannot use', async () => {
    mock.queueResults([], [], [], [], [{ value: 'soon' }])
    const body = await (await GET(getReq())).json()
    expect(body.tvSecondsPerScreen).toBe(10)
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
    //   1-5. readSetting('tiebreakWorkoutId'), readSetting('leaderboardVisibility'), readSetting('tvLeaderboardPercentages'), readSetting('tvLeaderboardOrder'), readSetting('tvSecondsPerScreen')
    //   6-8. workouts + athletes + divisions (Promise.all iteration calls .then)
    //   9. scores (post-Promise.all)
    mock.queueResults([], [], [], [], [], workouts, athletes, [], scores)

    const res = await GET(getReq())
    const body = await res.json()
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0].athleteName).toBe('Alice')
    expect(body.entries[0].totalPoints).toBe(2)
    expect(body.entries[1].athleteName).toBe('Bob')
    expect(body.entries[1].totalPoints).toBe(4)
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=5/)
  })

  // Skipping a workout ranks an athlete last in it. It used to add no points,
  // so Cy, who sat out B, led on 1 point to Ada's 2.
  it('ranks an athlete last in a finished workout they have no score in', async () => {
    const wk = (id: number, number: number, status: string) => ({
      id, number, name: String(number), scoreType: 'time', status,
      tiebreakEnabled: false, tiebreakScoreType: 'time', halfWeight: false,
      competitionId: 1, lanes: 10, heatIntervalSecs: 0, timeBetweenHeatsSecs: 0,
      callTimeSecs: 0, walkoutTimeSecs: 0, startTime: null, mixedHeats: false,
      partBEnabled: false, partBScoreType: 'time', heatStartOverrides: '{}', locationId: null,
      knockout: false, knockoutDecides: false,
    })
    const athletes = [
      { id: 1, name: 'Ada', divisionName: 'Rx' },
      { id: 2, name: 'Bo', divisionName: 'Rx' },
      { id: 3, name: 'Cy', divisionName: 'Rx' },
    ]
    const scores = [
      { athleteId: 3, workoutId: 10, points: 1, rawScore: 90, tiebreakRawScore: null },
      { athleteId: 1, workoutId: 10, points: 2, rawScore: 95, tiebreakRawScore: null },
      { athleteId: 2, workoutId: 10, points: 3, rawScore: 99, tiebreakRawScore: null },
      { athleteId: 1, workoutId: 11, points: 1, rawScore: 80, tiebreakRawScore: null },
      { athleteId: 2, workoutId: 11, points: 2, rawScore: 85, tiebreakRawScore: null },
      // Workout 12 is still running: nobody is placed for not having gone yet.
      { athleteId: 1, workoutId: 12, points: 1, rawScore: 70, tiebreakRawScore: null },
    ]
    mock.queueResults([], [], [], [], [], [wk(10, 1, 'completed'), wk(11, 2, 'completed'), wk(12, 3, 'active')], athletes, [], scores)

    const body = await (await GET(getReq())).json()
    const by = (name: string) => body.entries.find((e: { athleteName: string }) => e.athleteName === name)
    expect(by('Cy').workoutScores[11]).toMatchObject({ points: 3, display: 'No score', skipped: true })
    expect(by('Cy').totalPoints).toBe(4)
    expect(by('Bo').workoutScores[12]).toBeNull()
    expect(body.entries.map((e: { athleteName: string; totalPoints: number }) => [e.athleteName, e.totalPoints]))
      .toEqual([['Ada', 4], ['Cy', 4], ['Bo', 5]])
  })

  // A team is ranked as one entry; its members only ride along by name.
  it('lists a team\'s members on its one entry', async () => {
    const athletes = [
      { id: 1, name: 'Team A', divisionName: 'Teams' },
      { id: 2, name: 'Empty Team', divisionName: 'Teams' },
    ]
    //   10. team members (after scores; no workouts are visible, so no scores read)
    mock.queueResults([], [], [], [], [], [], athletes, [], [{ id: 7, athleteId: 1, name: 'Kami', gender: null, order: 0 }])

    const body = await (await GET(getReq())).json()

    expect(body.entries.map((e: { athleteName: string; members: string[] }) => [e.athleteName, e.members])).toEqual([
      ['Empty Team', []],
      ['Team A', ['Kami']],
    ])
  })

  // A knockout flagged as deciding the competition: once finished, its
  // placings are the standings and earlier points are set aside.
  it('ranks by a deciding knockout\'s placings alone once it is finished', async () => {
    const base = {
      scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time', halfWeight: false,
      competitionId: 1, lanes: 10, heatIntervalSecs: 0, timeBetweenHeatsSecs: 0,
      callTimeSecs: 0, walkoutTimeSecs: 0, startTime: null, mixedHeats: false,
      partBEnabled: false, partBScoreType: 'time', heatStartOverrides: '{}', locationId: null,
    }
    const workouts = [
      { ...base, id: 10, number: 1, name: 'A', status: 'completed', knockout: false, knockoutDecides: false },
      { ...base, id: 11, number: 2, name: 'Final', status: 'completed', knockout: true, knockoutDecides: true },
    ]
    const athletes = [
      { id: 1, name: 'Alice', divisionName: 'Rx' },
      { id: 2, name: 'Bob', divisionName: 'Rx' },
      { id: 3, name: 'Cara', divisionName: 'Rx' },
    ]
    const scores = [
      { athleteId: 1, workoutId: 10, points: 1, rawScore: 100, tiebreakRawScore: null },
      { athleteId: 2, workoutId: 10, points: 3, rawScore: 120, tiebreakRawScore: null },
      { athleteId: 3, workoutId: 10, points: 2, rawScore: 110, tiebreakRawScore: null },
      { athleteId: 1, workoutId: 11, points: 2, rawScore: 0, tiebreakRawScore: null, knockoutLabel: 'Final' },
      { athleteId: 2, workoutId: 11, points: 1, rawScore: 0, tiebreakRawScore: null, knockoutLabel: 'Final' },
    ]
    mock.queueResults([], [], [], [], [], workouts, athletes, [], scores)

    const body = await (await GET(getReq())).json()
    expect(body.decidingWorkoutId).toBe(11)
    expect(body.entries.map((e: { athleteName: string }) => e.athleteName)).toEqual(['Bob', 'Alice', 'Cara'])
    // Cara took no part in the final: she follows the placed, and the final
    // she skipped counts as last (3rd) on top of her 2.
    expect(body.entries.map((e: { totalPoints: number }) => e.totalPoints)).toEqual([1, 2, 5])
  })

  it('ranks as usual while the deciding knockout is not finished', async () => {
    const workouts = [
      { id: 11, number: 2, name: 'Final', scoreType: 'time', status: 'active', knockout: true, knockoutDecides: true, partBEnabled: false, halfWeight: false },
    ]
    mock.queueResults([], [], [], [], [], workouts, [{ id: 1, name: 'Alice', divisionName: null }], [], [])
    const body = await (await GET(getReq())).json()
    expect(body.decidingWorkoutId).toBeNull()
  })
})
