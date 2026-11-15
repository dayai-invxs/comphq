import { describe, expect, it } from 'vitest'
import { bySeed, hasResults, rankStandings, type StandingsScore, type StandingsWorkout } from './standings'
import type { Scoring } from './pointsScale'
import { scoringFromSettings } from './pointsScale'

const rank: Scoring = scoringFromSettings(() => undefined)

const wo = (id: number, extra: Partial<StandingsWorkout> = {}) => ({
  id, number: id, name: `W${id}`, scoreType: 'time', status: 'completed',
  partBEnabled: false, pointsStep: null, tiebreakEnabled: false, tiebreakScoreType: 'time',
  halfWeight: false, doubleWeight: false, knockout: false, knockoutDecides: false,
  ...extra,
}) as unknown as StandingsWorkout

const sc = (athleteId: number, workoutId: number, points: number, rawScore = points * 100): StandingsScore => ({
  athleteId, workoutId, points, rawScore, capped: false, tiebreakRawScore: null, partBPoints: null, knockoutLabel: null,
})

// Three athletes tied on 6 for 2nd–4th. Registration order (the ids) runs
// Dee, Cal, Bea — the order seeding used to fall back to. The board settles
// it: Bea and Dee each have a 2nd, Cal does not, so Cal is 4th; Bea and Dee
// have the same places, so the tiebreaker workout (W2) puts Dee ahead.
describe('rankStandings', () => {
  const athletes = [
    { id: 1, name: 'Ada', divisionName: 'RX' },
    { id: 2, name: 'Dee', divisionName: 'RX' },
    { id: 3, name: 'Cal', divisionName: 'RX' },
    { id: 4, name: 'Bea', divisionName: 'RX' },
  ]
  const scores = [
    sc(1, 10, 1), sc(1, 11, 1),
    sc(4, 10, 2), sc(4, 11, 4),
    sc(3, 10, 3), sc(3, 11, 3),
    sc(2, 10, 4), sc(2, 11, 2),
  ]

  it('breaks a three-way tie the way the leaderboard does', () => {
    const { entries } = rankStandings({
      visibleWorkouts: [wo(10), wo(11)], athletes, scores, scoring: rank, tiebreakWorkoutId: 11,
    })
    expect(entries.map((e) => e.athleteName)).toEqual(['Ada', 'Dee', 'Bea', 'Cal'])
    expect(entries.map((e) => e.totalPoints)).toEqual([2, 6, 6, 6])
  })

  it('falls back to the name when nothing else separates them', () => {
    const { entries } = rankStandings({
      visibleWorkouts: [wo(10), wo(11)], athletes, scores, scoring: rank, tiebreakWorkoutId: null,
    })
    expect(entries.map((e) => e.athleteName)).toEqual(['Ada', 'Bea', 'Dee', 'Cal'])
  })

  it('counts a double-weight workout twice', () => {
    const { entries } = rankStandings({
      visibleWorkouts: [wo(10), wo(11, { doubleWeight: true } as Partial<StandingsWorkout>)],
      athletes, scores, scoring: rank, tiebreakWorkoutId: null,
    })
    // Ada 3, Dee 8, Cal 9, Bea 10.
    expect(entries.map((e) => e.athleteName)).toEqual(['Ada', 'Dee', 'Cal', 'Bea'])
  })
})

describe('bySeed', () => {
  it('puts the board first, then anyone not on it in registration order', () => {
    const order = new Map([[7, 0], [3, 1]])
    const seeded = [{ id: 9 }, { id: 3 }, { id: 5 }, { id: 7 }].sort(bySeed(order))
    expect(seeded.map((a) => a.id)).toEqual([7, 3, 5, 9])
  })
})

describe('hasResults', () => {
  it('is false with nothing on the board', () => {
    expect(hasResults({ athleteId: 1, athleteName: 'A', divisionName: null, totalPoints: 0, workoutScores: { 1: null } })).toBe(false)
  })
})

// The board shows a rounds + reps workout nobody got a round in as reps.
describe('rankStandings display of a reps-only workout', () => {
  const athletes = [{ id: 1, name: 'Ada', divisionName: 'RX' }, { id: 2, name: 'Bea', divisionName: 'RX' }]
  const rr = wo(20, { scoreType: 'rounds_reps' } as Partial<StandingsWorkout>)

  it('shows the rep count when no score has a round', () => {
    const { entries } = rankStandings({
      visibleWorkouts: [rr], athletes, scores: [sc(1, 20, 1, 143), sc(2, 20, 2, 98)], scoring: rank, tiebreakWorkoutId: null,
    })
    expect(entries.map((e) => e.workoutScores[20]?.display)).toEqual(['143', '98'])
  })

  it('shows rounds and reps once anyone has a round', () => {
    const { entries } = rankStandings({
      visibleWorkouts: [rr], athletes, scores: [sc(1, 20, 1, 10_012), sc(2, 20, 2, 98)], scoring: rank, tiebreakWorkoutId: null,
    })
    expect(entries.map((e) => e.workoutScores[20]?.display)).toEqual(['1r + 12', '0r + 98'])
  })
})
