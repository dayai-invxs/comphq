import { describe, it, expect } from 'vitest'
import { calculateRankings, calcCumulativePoints, assignHeats, lowerIsBetter, type AthleteWithScore } from './scoring'

describe('lowerIsBetter', () => {
  it('is true for time and lower_is_better', () => {
    expect(lowerIsBetter('time')).toBe(true)
    expect(lowerIsBetter('lower_is_better')).toBe(true)
  })
  it('is false for others', () => {
    expect(lowerIsBetter('rounds_reps')).toBe(false)
    expect(lowerIsBetter('higher_is_better')).toBe(false)
  })
})

describe('calculateRankings', () => {
  it('ranks lower-is-better with 1 being best', () => {
    const ranked = calculateRankings(
      [{ athleteId: 1, rawScore: 100 }, { athleteId: 2, rawScore: 90 }, { athleteId: 3, rawScore: 110 }],
      'time',
    )
    expect(ranked.map(r => [r.athleteId, r.points])).toEqual([[2, 1], [1, 2], [3, 3]])
  })

  it('ranks higher-is-better descending', () => {
    const ranked = calculateRankings(
      [{ athleteId: 1, rawScore: 100 }, { athleteId: 2, rawScore: 200 }],
      'rounds_reps',
    )
    expect(ranked[0].athleteId).toBe(2)
  })

  it('honors tiebreaker when enabled', () => {
    const ranked = calculateRankings(
      [
        { athleteId: 1, rawScore: 100, tiebreakRawScore: 30 },
        { athleteId: 2, rawScore: 100, tiebreakRawScore: 20 },
      ],
      'time',
      true,
    )
    expect(ranked[0].athleteId).toBe(2)
  })

  it('treats null tiebreak as worst', () => {
    const ranked = calculateRankings(
      [
        { athleteId: 1, rawScore: 100, tiebreakRawScore: null },
        { athleteId: 2, rawScore: 100, tiebreakRawScore: 50 },
      ],
      'time',
      true,
    )
    expect(ranked[0].athleteId).toBe(2)
    expect(ranked[1].athleteId).toBe(1)
  })
})

describe('calcCumulativePoints', () => {
  it('sums points only for completed workouts', () => {
    const athletes: AthleteWithScore[] = [
      {
        id: 1, name: 'A', bibNumber: null, divisionId: null,
        scores: [
          { id: 1, athleteId: 1, workoutId: 10, rawScore: 0, tiebreakRawScore: null, points: 3, partBRawScore: null, partBPoints: null },
          { id: 2, athleteId: 1, workoutId: 11, rawScore: 0, tiebreakRawScore: null, points: 5, partBRawScore: null, partBPoints: null },
          { id: 3, athleteId: 1, workoutId: 99, rawScore: 0, tiebreakRawScore: null, points: 100, partBRawScore: null, partBPoints: null },
        ],
      },
    ]
    const totals = calcCumulativePoints(athletes, [10, 11])
    expect(totals.get(1)).toBe(8)
  })
})

describe('assignHeats', () => {
  it('fills heats front-to-back in registration order when not seeded, mixed', () => {
    const athletes = [
      { id: 1, divisionId: null }, { id: 2, divisionId: null }, { id: 3, divisionId: null },
    ]
    const result = assignHeats(athletes, 2, { mixedHeats: true, divisionOrder: new Map() })
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ athleteId: 1, heatNumber: 1, lane: 1 })
    expect(result[2]).toMatchObject({ athleteId: 3, heatNumber: 2, lane: 1 })
  })

  it('separates by division and orders by divisionOrder when not mixed', () => {
    const athletes = [
      { id: 1, divisionId: 2 }, { id: 2, divisionId: 1 }, { id: 3, divisionId: 1 },
    ]
    const divisionOrder = new Map([[1, 0], [2, 1]])
    const result = assignHeats(athletes, 2, { mixedHeats: false, divisionOrder })
    const div1Heats = result.filter(r => [2, 3].includes(r.athleteId)).map(r => r.heatNumber)
    const div2Heats = result.filter(r => r.athleteId === 1).map(r => r.heatNumber)
    expect(Math.max(...div1Heats)).toBeLessThan(Math.min(...div2Heats))
  })

  it('when seeded, puts best (lowest cumulative points) in last/championship heat', () => {
    const athletes = [
      { id: 1, divisionId: null }, { id: 2, divisionId: null },
      { id: 3, divisionId: null }, { id: 4, divisionId: null },
    ]
    const cumulativePoints = new Map([[1, 10], [2, 20], [3, 5], [4, 15]])
    const result = assignHeats(athletes, 2, { cumulativePoints, mixedHeats: true, divisionOrder: new Map() })
    const last = result.filter(r => r.heatNumber === 2)
    expect(last.map(r => r.athleteId).sort()).toEqual([1, 3])
  })
})
