import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drizzleMock as mock } from '@/test/setup'

const { rankAndPersist, getCompletedHeats } = vi.hoisted(() => ({
  rankAndPersist: vi.fn(),
  getCompletedHeats: vi.fn(),
}))
vi.mock('@/lib/scoring', () => ({ rankAndPersist }))
vi.mock('@/lib/heatCompletion', () => ({ getCompletedHeats }))

import { rankableAthletes, rankCompletedHeats } from './heatRanking'

const lane = (athleteId: number, heatNumber: number) => ({ athleteId, heatNumber })

describe('rankableAthletes', () => {
  it('counts only athletes whose heat is complete', () => {
    expect(rankableAthletes([lane(1, 1), lane(2, 1), lane(3, 2)], [1])).toEqual(new Set([1, 2]))
  })

  it('counts nobody before any heat is complete', () => {
    expect(rankableAthletes([lane(1, 1), lane(2, 2)], [])).toEqual(new Set())
  })

  // A split team's total is only whole once its last heat is done.
  it('waits for every heat of a team split across heats', () => {
    expect(rankableAthletes([lane(7, 1), lane(7, 2)], [1])).toEqual(new Set())
    expect(rankableAthletes([lane(7, 1), lane(7, 2), lane(8, 3)], [1, 2])).toEqual(new Set([7]))
  })

  it('counts everyone once every heat is complete', () => {
    expect(rankableAthletes([lane(1, 1), lane(2, 2)], [1, 2])).toBeNull()
  })

  it('counts nobody for a workout with no heats yet', () => {
    expect(rankableAthletes([], [])).toEqual(new Set())
  })
})

describe('rankCompletedHeats', () => {
  const WK = { scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time', partBEnabled: false, partBScoreType: 'time' }
  const row = (athleteId: number, points: number | null) => ({
    athleteId, workoutId: 1, rawScore: 100 + athleteId, tiebreakRawScore: null, partBRawScore: null,
    capped: false, partBCapped: false, points, partBPoints: null, divisionId: null,
  })

  beforeEach(() => {
    rankAndPersist.mockReset().mockResolvedValue({ count: 0, error: null })
    getCompletedHeats.mockReset()
  })

  // Athlete 3's score was typed in before heat 2 ran, and an earlier ranking
  // of the whole workout had placed them.
  it('ranks the completed heat\'s scores and takes the placing away from the rest', async () => {
    getCompletedHeats.mockResolvedValue([1])
    mock.queueResult([row(1, null), row(2, null), row(3, 1)]) // scores
    mock.queueResult([lane(1, 1), lane(2, 1), lane(3, 2)]) // assignments
    mock.queueResult(undefined) // clear

    const result = await rankCompletedHeats(1, WK)
    expect(result).toEqual({ completedHeats: [1], workoutDone: false, error: null })
    expect(rankAndPersist.mock.calls[0][2].map((s: { athleteId: number }) => s.athleteId)).toEqual([1, 2])
    expect(mock.calls.find((c) => c.method === 'set')!.args[0]).toEqual({ points: null, partBPoints: null })
  })

  it('ranks everyone once the workout is done, and clears nothing', async () => {
    getCompletedHeats.mockResolvedValue([1, 2])
    mock.queueResult([row(1, null), row(3, null)])
    mock.queueResult([lane(1, 1), lane(3, 2)])

    const result = await rankCompletedHeats(1, WK)
    expect(result.workoutDone).toBe(true)
    expect(rankAndPersist.mock.calls[0][2]).toHaveLength(2)
    expect(mock.calls.some((c) => c.method === 'set')).toBe(false)
  })
})
