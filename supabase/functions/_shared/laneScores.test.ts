import { describe, expect, it } from 'vitest'
import { sumLaneScores } from './laneScores'

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
})
