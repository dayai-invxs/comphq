import { describe, expect, it } from 'vitest'
import { laneTotalRule, sumLaneScores } from './laneScores'

const lane = (rawScore: number | null, tiebreakRawScore: number | null = null, partBRawScore: number | null = null) =>
  ({ rawScore, tiebreakRawScore, partBRawScore })

describe('sumLaneScores', () => {
  it('adds every lane', () => {
    expect(sumLaneScores([lane(60_000, 10_000, 5), lane(90_000, 20_000, 7)]))
      .toEqual({ rawScore: 150_000, tiebreakRawScore: 30_000, partBRawScore: 12 })
  })

  it('has no total until every lane is scored', () => {
    expect(sumLaneScores([lane(60_000), lane(null)])).toBeNull()
    expect(sumLaneScores([])).toBeNull()
  })

  it('leaves the tiebreak or Part B empty when a lane lacks one', () => {
    expect(sumLaneScores([lane(1, 2, null), lane(3, null, 4)]))
      .toEqual({ rawScore: 4, tiebreakRawScore: null, partBRawScore: null })
  })

  it('counts a zero as a score', () => {
    expect(sumLaneScores([lane(0), lane(5)])).toEqual({ rawScore: 5, tiebreakRawScore: null, partBRawScore: null })
  })

  // "Highest individual rep count" breaks the tie: the team's best lane, not a sum.
  it('takes the best lane as the tiebreak when the best athlete breaks ties', () => {
    expect(sumLaneScores([lane(52, 3), lane(71, 9), lane(64)], { bestLaneOf: 'higher_is_better' }))
      .toEqual({ rawScore: 187, tiebreakRawScore: 71, partBRawScore: null })
  })

  it('takes the fastest lane when the score is a time', () => {
    expect(sumLaneScores([lane(300_000), lane(240_000)], { bestLaneOf: 'time' })?.tiebreakRawScore).toBe(240_000)
  })

  it('still has no total until every lane is scored', () => {
    expect(sumLaneScores([lane(52), lane(null)], { bestLaneOf: 'higher_is_better' })).toBeNull()
  })
})

describe('laneTotalRule', () => {
  it('names the score type only when the best athlete breaks ties', () => {
    expect(laneTotalRule({ scoreType: 'higher_is_better', tiebreakBestLane: true })).toEqual({ bestLaneOf: 'higher_is_better' })
    expect(laneTotalRule({ scoreType: 'higher_is_better', tiebreakBestLane: false })).toEqual({ bestLaneOf: null })
  })
})
