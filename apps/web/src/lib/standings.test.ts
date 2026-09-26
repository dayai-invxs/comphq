import { describe, expect, it } from 'vitest'
import type { LeaderboardEntry, WorkoutScore } from '@/api/liveReads'
import { divisionsOf, formatTotal, hasAnyScore, rankRows, sameEverywhere, tvDivisionsOf } from './standings'

function entry(over: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    athleteId: 1,
    athleteName: 'Ada',
    divisionName: 'RX',
    totalPoints: 0,
    workoutScores: {},
    ...over,
  }
}

const score = (points: number, over: Partial<NonNullable<WorkoutScore>> = {}): WorkoutScore => ({
  points,
  display: `${points}:00`,
  tiebreakDisplay: null,
  ...over,
})

describe('divisionsOf', () => {
  // A division whose athletes have all scored nothing gets no table: the board
  // is a record of what happened, not of who registered.
  it('ignores divisions where nobody has a score yet', () => {
    const rows = [
      entry({ athleteId: 1, divisionName: 'RX', workoutScores: { 1: score(1) } }),
      entry({ athleteId: 2, divisionName: 'Scaled', workoutScores: { 1: null } }),
    ]
    expect(divisionsOf(rows)).toEqual(['RX'])
  })

  it('sorts alphabetically and puts the division-less athletes last', () => {
    const rows = [
      entry({ athleteId: 1, divisionName: null, workoutScores: { 1: score(1) } }),
      entry({ athleteId: 2, divisionName: 'Scaled', workoutScores: { 1: score(2) } }),
      entry({ athleteId: 3, divisionName: 'Masters', workoutScores: { 1: score(3) } }),
    ]
    expect(divisionsOf(rows)).toEqual(['Masters', 'Scaled', null])
  })

  it('names each division once, however many athletes it holds', () => {
    const rows = [
      entry({ athleteId: 1, divisionName: 'RX', workoutScores: { 1: score(1) } }),
      entry({ athleteId: 2, divisionName: 'RX', workoutScores: { 1: score(2) } }),
    ]
    expect(divisionsOf(rows)).toEqual(['RX'])
  })
})

// Equal totals are not the same result. Two athletes reach 6 by placing 3rd
// twice or by placing 1st and 5th, and only the first pair actually tied.
describe('sameEverywhere', () => {
  const ids = [1, 2]

  it('is false when the totals differ', () => {
    const a = entry({ totalPoints: 4, workoutScores: { 1: score(2), 2: score(2) } })
    const b = entry({ totalPoints: 6, workoutScores: { 1: score(3), 2: score(3) } })
    expect(sameEverywhere(a, b, ids)).toBe(false)
  })

  it('is false when the same total came from different placings', () => {
    const a = entry({ totalPoints: 6, workoutScores: { 1: score(1), 2: score(5) } })
    const b = entry({ totalPoints: 6, workoutScores: { 1: score(3), 2: score(3) } })
    expect(sameEverywhere(a, b, ids)).toBe(false)
  })

  it('is true only when every workout matches', () => {
    const a = entry({ totalPoints: 6, workoutScores: { 1: score(3), 2: score(3) } })
    const b = entry({ totalPoints: 6, workoutScores: { 1: score(3), 2: score(3) } })
    expect(sameEverywhere(a, b, ids)).toBe(true)
  })

  // A workout neither athlete has entered is a match, not a mismatch.
  it('treats two absent scores as matching', () => {
    const a = entry({ totalPoints: 3, workoutScores: { 1: score(3) } })
    const b = entry({ totalPoints: 3, workoutScores: { 1: score(3) } })
    expect(sameEverywhere(a, b, [1, 2])).toBe(true)
  })
})

describe('rankRows', () => {
  const scored = (r: LeaderboardEntry) => hasAnyScore(r)

  // Tied athletes share a placing and the positions they occupy are skipped:
  // two athletes in 2nd means the next one is 4th.
  it('shares a placing and skips the positions it consumed', () => {
    const rows = [
      entry({ athleteId: 1, totalPoints: 2, workoutScores: { 1: score(2) } }),
      entry({ athleteId: 2, totalPoints: 4, workoutScores: { 1: score(4) } }),
      entry({ athleteId: 3, totalPoints: 4, workoutScores: { 1: score(4) } }),
      entry({ athleteId: 4, totalPoints: 9, workoutScores: { 1: score(9) } }),
    ]
    const tied = (a: LeaderboardEntry, b: LeaderboardEntry) => sameEverywhere(a, b, [1])
    expect(rankRows(rows, scored, tied).map((r) => r.rank)).toEqual([1, 2, 2, 4])
  })

  // An athlete with no score at all is not ranked last, they are unranked —
  // and they do not consume a placing on the way past.
  it('leaves an athlete who has scored nothing unranked', () => {
    const rows = [
      entry({ athleteId: 1, totalPoints: 1, workoutScores: { 1: score(1) } }),
      entry({ athleteId: 2, totalPoints: 0, workoutScores: { 1: null } }),
      entry({ athleteId: 3, totalPoints: 3, workoutScores: { 1: score(3) } }),
    ]
    const tied = (a: LeaderboardEntry, b: LeaderboardEntry) => sameEverywhere(a, b, [1])
    expect(rankRows(rows, scored, tied).map((r) => r.rank)).toEqual([1, '—', 3])
  })

  it('keeps the order it was handed', () => {
    const rows = [entry({ athleteId: 7, workoutScores: { 1: score(1) } })]
    expect(rankRows(rows, scored, () => false)[0].entry.athleteId).toBe(7)
  })
})

// halfWeight multiplies a workout's points by 0.5, so totals carry a half.
describe('formatTotal', () => {
  it('shows a whole total without a decimal', () => {
    expect(formatTotal(12)).toBe('12')
  })

  it('shows a half-weighted total to one place', () => {
    expect(formatTotal(6.5)).toBe('6.5')
  })
})

describe('tvDivisionsOf', () => {
  // The scoreboard's order is set on the setup screen, division by division,
  // so a competition can put its headline division on the left.
  it('takes the order the competition set', () => {
    const rows = [
      entry({ athleteId: 1, divisionName: 'Masters' }),
      entry({ athleteId: 2, divisionName: 'RX' }),
      entry({ athleteId: 3, divisionName: 'Scaled' }),
    ]
    expect(tvDivisionsOf(rows, { RX: 1, Scaled: 2, Masters: 3 })).toEqual(['RX', 'Scaled', 'Masters'])
  })

  // A division nobody gave a position to still belongs on the board, behind
  // the ones that were placed.
  it('puts an unplaced division after every placed one, alphabetically', () => {
    const rows = [
      entry({ athleteId: 1, divisionName: 'Scaled' }),
      entry({ athleteId: 2, divisionName: 'Masters' }),
      entry({ athleteId: 3, divisionName: 'RX' }),
    ]
    expect(tvDivisionsOf(rows, { RX: 1 })).toEqual(['RX', 'Masters', 'Scaled'])
  })

  it('puts the division-less athletes last whatever the order says', () => {
    const rows = [
      entry({ athleteId: 1, divisionName: null }),
      entry({ athleteId: 2, divisionName: 'RX' }),
    ]
    expect(tvDivisionsOf(rows, { RX: 9 })).toEqual(['RX', null])
  })

  // Where divisionsOf drops a division nobody has scored in, this one keeps
  // it: the scoreboard is a fixed set of panels that a gym display is aimed
  // at, and a panel appearing mid-competition moves every other panel.
  it('keeps a division nobody has scored in yet', () => {
    const rows = [
      entry({ athleteId: 1, divisionName: 'RX', workoutScores: { 1: score(1) } }),
      entry({ athleteId: 2, divisionName: 'Scaled', workoutScores: { 1: null } }),
    ]
    expect(tvDivisionsOf(rows, {})).toEqual(['RX', 'Scaled'])
    expect(divisionsOf(rows)).toEqual(['RX'])
  })
})
