import { describe, it, expect } from 'vitest'
import { drizzleMock as mock } from '@/test/setup'
import { calculateRankings, calcCumulativePoints, assignHeats, lowerIsBetter, rankAndPersist, type AthleteWithScore } from './scoring'

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

  it('gives tied athletes the same points and skips positions after a tie', () => {
    const ranked = calculateRankings(
      [
        { athleteId: 1, rawScore: 70 },
        { athleteId: 2, rawScore: 80 },
        { athleteId: 3, rawScore: 80 },
        { athleteId: 4, rawScore: 90 },
      ],
      'time',
    )
    const byId = Object.fromEntries(ranked.map(r => [r.athleteId, r.points]))
    expect(byId[1]).toBe(1)   // 1st
    expect(byId[2]).toBe(2)   // tied 2nd
    expect(byId[3]).toBe(2)   // tied 2nd
    expect(byId[4]).toBe(4)   // 4th (skips 3rd)
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
        id: 1, competitionId: 1, name: 'A', bibNumber: null, divisionId: null, userId: null, withdrawn: false, externalId: null, gender: null,
        scores: [
          { id: 1, athleteId: 1, workoutId: 10, rawScore: 0, tiebreakRawScore: null, points: 3, partBRawScore: null, partBPoints: null, capped: false, partBCapped: false, knockoutLabel: null },
          { id: 2, athleteId: 1, workoutId: 11, rawScore: 0, tiebreakRawScore: null, points: 5, partBRawScore: null, partBPoints: null, capped: false, partBCapped: false, knockoutLabel: null },
          { id: 3, athleteId: 1, workoutId: 99, rawScore: 0, tiebreakRawScore: null, points: 100, partBRawScore: null, partBPoints: null, capped: false, partBCapped: false, knockoutLabel: null },
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

  it('when seeded, puts 1st in the middle lane, then one up, one down: 3, 4, 2, 5, 1, 6', () => {
    const athletes = [1, 2, 3, 4, 5, 6].map((id) => ({ id, divisionId: null }))
    // Athlete n is nth on the leaderboard.
    const cumulativePoints = new Map(athletes.map((a) => [a.id, a.id * 10]))
    const result = assignHeats(athletes, 6, { cumulativePoints, mixedHeats: true, divisionOrder: new Map() })
    expect([1, 2, 3, 4, 5, 6].map((id) => result.find((r) => r.athleteId === id)!.lane)).toEqual([3, 4, 2, 5, 1, 6])
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

describe('rankAndPersist', () => {
  const workout = {
    scoreType: 'time',
    tiebreakEnabled: false,
    tiebreakScoreType: 'time',
    partBEnabled: false,
    partBScoreType: 'time',
  }

  function lastValues() {
    const valuesCalls = mock.calls.filter((c) => c.method === 'values')
    return valuesCalls[valuesCalls.length - 1].args[0]
  }

  it('ranks scores and persists via a single bulk upsert', async () => {
    mock.queueResult(undefined)

    const result = await rankAndPersist(7, workout, [
      { athleteId: 1, workoutId: 7, rawScore: 100, tiebreakRawScore: null, partBRawScore: null, divisionId: 1, capped: false, partBCapped: false },
      { athleteId: 2, workoutId: 7, rawScore: 80, tiebreakRawScore: null, partBRawScore: null, divisionId: 1, capped: false, partBCapped: false },
      { athleteId: 3, workoutId: 7, rawScore: 120, tiebreakRawScore: null, partBRawScore: null, divisionId: 1, capped: false, partBCapped: false },
    ])

    expect(result.count).toBe(3)
    expect(result.error).toBeNull()

    const rows = lastValues() as Array<{ athleteId: number; points: number }>
    expect(rows).toHaveLength(3)
    const byId = Object.fromEntries(rows.map((r) => [r.athleteId, r.points]))
    expect(byId).toEqual({ 2: 1, 1: 2, 3: 3 })
  })

  it('preserves rawScore/tiebreak/partBRawScore on the upserted rows', async () => {
    mock.queueResult(undefined)
    await rankAndPersist(7, { ...workout, partBEnabled: true }, [
      { athleteId: 1, workoutId: 7, rawScore: 100, tiebreakRawScore: 5, partBRawScore: 50, divisionId: 1, capped: false, partBCapped: false },
    ])
    const row = (lastValues() as Array<Record<string, unknown>>)[0]
    expect(row).toMatchObject({ rawScore: 100, tiebreakRawScore: 5, partBRawScore: 50 })
  })

  it('computes partB points when enabled, leaves them null otherwise', async () => {
    mock.queueResult(undefined)
    await rankAndPersist(7, { ...workout, partBEnabled: true }, [
      { athleteId: 1, workoutId: 7, rawScore: 100, tiebreakRawScore: null, partBRawScore: 30, divisionId: 1, capped: false, partBCapped: false },
      { athleteId: 2, workoutId: 7, rawScore: 80, tiebreakRawScore: null, partBRawScore: 20, divisionId: 1, capped: false, partBCapped: false },
    ])
    const rows = lastValues() as Array<{ athleteId: number; partBPoints: number | null }>
    const byId = Object.fromEntries(rows.map((r) => [r.athleteId, r.partBPoints]))
    expect(byId[2]).toBe(1)
    expect(byId[1]).toBe(2)
  })

  it('when partBEnabled, Part B score breaks ties in Part A ranking', async () => {
    mock.queueResult(undefined)
    // Athletes 1 and 2 tie on Part A (same rawScore); athlete 2 has better Part B → wins the tie
    await rankAndPersist(7, { ...workout, partBEnabled: true, partBScoreType: 'time' }, [
      { athleteId: 1, workoutId: 7, rawScore: 100, tiebreakRawScore: null, partBRawScore: 50, divisionId: 1, capped: false, partBCapped: false },
      { athleteId: 2, workoutId: 7, rawScore: 100, tiebreakRawScore: null, partBRawScore: 30, divisionId: 1, capped: false, partBCapped: false },
      { athleteId: 3, workoutId: 7, rawScore: 120, tiebreakRawScore: null, partBRawScore: 40, divisionId: 1, capped: false, partBCapped: false },
    ])
    const rows = lastValues() as Array<{ athleteId: number; points: number }>
    const byId = Object.fromEntries(rows.map((r) => [r.athleteId, r.points]))
    expect(byId[2]).toBe(1) // tied Part A, better Part B → 1st
    expect(byId[1]).toBe(2) // tied Part A, worse Part B → 2nd
    expect(byId[3]).toBe(3)
  })

  it('when partBEnabled, Part A score breaks ties in Part B ranking', async () => {
    mock.queueResult(undefined)
    // Athletes 1 and 2 tie on Part B; athlete 2 has better Part A → wins the Part B tie
    await rankAndPersist(7, { ...workout, partBEnabled: true, partBScoreType: 'time' }, [
      { athleteId: 1, workoutId: 7, rawScore: 110, tiebreakRawScore: null, partBRawScore: 40, divisionId: 1, capped: false, partBCapped: false },
      { athleteId: 2, workoutId: 7, rawScore: 90,  tiebreakRawScore: null, partBRawScore: 40, divisionId: 1, capped: false, partBCapped: false },
      { athleteId: 3, workoutId: 7, rawScore: 80,  tiebreakRawScore: null, partBRawScore: 60, divisionId: 1, capped: false, partBCapped: false },
    ])
    const rows = lastValues() as Array<{ athleteId: number; partBPoints: number | null }>
    const byId = Object.fromEntries(rows.map((r) => [r.athleteId, r.partBPoints]))
    expect(byId[2]).toBe(1) // tied Part B (40s), better Part A (90s) → 1st
    expect(byId[1]).toBe(2) // tied Part B (40s), worse Part A (110s) → 2nd
    expect(byId[3]).toBe(3) // slowest Part B (60s) → 3rd
  })

  it('leaves partBPoints null when partBEnabled is false', async () => {
    mock.queueResult(undefined)
    await rankAndPersist(7, workout, [
      { athleteId: 1, workoutId: 7, rawScore: 100, tiebreakRawScore: null, partBRawScore: 30, divisionId: 1, capped: false, partBCapped: false },
    ])
    const row = (lastValues() as Array<Record<string, unknown>>)[0]
    expect(row.partBPoints).toBeNull()
  })

  it('ranks each division independently so points restart at 1 per division', async () => {
    mock.queueResult(undefined)
    await rankAndPersist(7, workout, [
      { athleteId: 1, workoutId: 7, rawScore: 80, tiebreakRawScore: null, partBRawScore: null, divisionId: 1, capped: false, partBCapped: false },
      { athleteId: 2, workoutId: 7, rawScore: 90, tiebreakRawScore: null, partBRawScore: null, divisionId: 1, capped: false, partBCapped: false },
      { athleteId: 3, workoutId: 7, rawScore: 70, tiebreakRawScore: null, partBRawScore: null, divisionId: 2, capped: false, partBCapped: false },
      { athleteId: 4, workoutId: 7, rawScore: 100, tiebreakRawScore: null, partBRawScore: null, divisionId: 2, capped: false, partBCapped: false },
    ])
    const rows = lastValues() as Array<{ athleteId: number; points: number }>
    const byId = Object.fromEntries(rows.map((r) => [r.athleteId, r.points]))
    // Div 1: athlete 1 (80s) = 1st, athlete 2 (90s) = 2nd
    expect(byId[1]).toBe(1)
    expect(byId[2]).toBe(2)
    // Div 2: athlete 3 (70s) = 1st, athlete 4 (100s) = 2nd — NOT 3rd/4th
    expect(byId[3]).toBe(1)
    expect(byId[4]).toBe(2)
  })

  it('returns count=0 and skips DB when no scores to rank', async () => {
    const result = await rankAndPersist(7, workout, [])
    expect(result.count).toBe(0)
    expect(mock.calls).toHaveLength(0)
  })
})

// A capped score holds rounds and reps, so it never compares with a time by value.
describe('calculateRankings with capped scores', () => {
  const pointsOf = (ranked: { athleteId: number; points: number }[]) =>
    Object.fromEntries(ranked.map((r) => [r.athleteId, r.points]))

  it('places every finisher ahead of every capped athlete, however the numbers compare', () => {
    const ranked = calculateRankings([
      { athleteId: 1, rawScore: 40_012, capped: true }, // 4 rounds + 12: a smaller number than the time below
      { athleteId: 2, rawScore: 600_000 },
      { athleteId: 3, rawScore: 500_000 },
    ], 'time')
    expect(pointsOf(ranked)).toEqual({ 3: 1, 2: 2, 1: 3 })
  })

  it('orders capped athletes by rounds, then reps, most first', () => {
    const ranked = calculateRankings([
      { athleteId: 1, rawScore: 30_020, capped: true },
      { athleteId: 2, rawScore: 40_005, capped: true },
      { athleteId: 3, rawScore: 40_012, capped: true },
    ], 'time')
    expect(pointsOf(ranked)).toEqual({ 3: 1, 2: 2, 1: 3 })
  })

  it('ties capped athletes on the same rounds and reps', () => {
    const ranked = calculateRankings([
      { athleteId: 1, rawScore: 40_012, capped: true },
      { athleteId: 2, rawScore: 40_012, capped: true },
      { athleteId: 3, rawScore: 30_000, capped: true },
    ], 'time')
    expect(pointsOf(ranked)).toEqual({ 1: 1, 2: 1, 3: 3 })
  })

  it('does not tie a time with a capped score of the same number', () => {
    const ranked = calculateRankings([
      { athleteId: 1, rawScore: 40_012, capped: true },
      { athleteId: 2, rawScore: 40_012 },
    ], 'time')
    expect(pointsOf(ranked)).toEqual({ 2: 1, 1: 2 })
  })

  it('breaks a capped tie with the tiebreak', () => {
    const ranked = calculateRankings([
      { athleteId: 1, rawScore: 40_012, capped: true, tiebreakRawScore: 200_000 },
      { athleteId: 2, rawScore: 40_012, capped: true, tiebreakRawScore: 100_000 },
    ], 'time', true, 'time')
    expect(pointsOf(ranked)).toEqual({ 2: 1, 1: 2 })
  })

  it('reads a capped Part B as worse than a finished one when it breaks a tie', () => {
    const ranked = calculateRankings([
      { athleteId: 1, rawScore: 300_000, tiebreakRawScore: 40_012, tiebreakCapped: true },
      { athleteId: 2, rawScore: 300_000, tiebreakRawScore: 90_000 },
    ], 'time', true, 'time')
    expect(pointsOf(ranked)).toEqual({ 2: 1, 1: 2 })
  })
})
