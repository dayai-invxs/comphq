import { describe, expect, it } from 'vitest'
import { compareTotals, placePoints, RANK_SCORING, scoringFromSettings, workoutPoints, type Scoring } from './pointsScale'

const highest = (first = 100, step = 10): Scoring => ({ system: 'points', scale: { first, step } })

describe('placePoints', () => {
  it('is the place itself on a rank-scored competition', () => {
    expect(placePoints(1, RANK_SCORING)).toBe(1)
    expect(placePoints(7, RANK_SCORING, 5)).toBe(7)
  })

  it('gives 1st the top points and each place the step fewer', () => {
    expect([1, 2, 3, 10].map((p) => placePoints(p, highest()))).toEqual([100, 90, 80, 10])
  })

  it('gives 0 below zero', () => {
    expect(placePoints(11, highest())).toBe(0)
    expect(placePoints(40, highest())).toBe(0)
  })

  it('uses the workout’s own step when it has one', () => {
    expect([1, 2, 3].map((p) => placePoints(p, highest(), 5))).toEqual([100, 95, 90])
    expect(placePoints(2, highest(), null)).toBe(90)
    expect(placePoints(5, highest(), 0)).toBe(100)
  })
})

describe('workoutPoints', () => {
  it('adds Part B’s points to Part A’s', () => {
    expect(workoutPoints(1, 2, highest())).toBe(190)
    expect(workoutPoints(1, null, highest())).toBe(100)
    expect(workoutPoints(1, 2, RANK_SCORING)).toBe(3)
  })
})

describe('scoringFromSettings', () => {
  const from = (values: Record<string, string>) => scoringFromSettings((k) => values[k])

  it('is the rank system for a competition that never chose', () => {
    expect(from({})).toEqual(RANK_SCORING)
  })

  it('reads the points system and its numbers', () => {
    expect(from({ scoringSystem: 'points', pointsFirst: '50', pointsStep: '3' }))
      .toEqual(highest(50, 3))
  })

  it('falls back to the defaults for numbers it cannot use', () => {
    expect(from({ scoringSystem: 'points', pointsFirst: '0', pointsStep: '-2' }))
      .toEqual(highest())
  })
})

describe('compareTotals', () => {
  it('puts the lower total first on rank, the higher on points', () => {
    expect([5, 3, 9].sort((a, b) => compareTotals(a, b, RANK_SCORING))).toEqual([3, 5, 9])
    expect([5, 3, 9].sort((a, b) => compareTotals(a, b, highest()))).toEqual([9, 5, 3])
  })
})
