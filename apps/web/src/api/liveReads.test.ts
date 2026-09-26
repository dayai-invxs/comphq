import { describe, expect, it, vi } from 'vitest'
import { checksOptions, leaderboardOptions, opsOptions, scheduleOptions } from './liveReads'
import { queryKeys } from './queryKeys'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet }))

describe('live reads', () => {
  it('asks the endpoint v1 asked, for the slug it was given', () => {
    for (const [build, path] of [
      [leaderboardOptions, '/api/leaderboard?slug=summer'],
      [opsOptions, '/api/ops?slug=summer'],
      [scheduleOptions, '/api/schedule?slug=summer'],
      [checksOptions, '/api/checks?slug=summer'],
    ] as const) {
      apiGet.mockClear()
      build('summer').queryFn()
      expect(apiGet).toHaveBeenCalledWith(path)
    }
  })

  // These are v1's numbers. A screen that refreshes slower than the one beside
  // it is what makes two officials disagree about the same heat.
  it('polls at the rate each screen promises', () => {
    expect(leaderboardOptions('summer').refetchInterval).toBe(15_000)
    expect(opsOptions('summer').refetchInterval).toBe(10_000)
    expect(scheduleOptions('summer').refetchInterval).toBe(10_000)
    expect(checksOptions('summer').refetchInterval).toBe(15_000)
    expect(checksOptions('summer').staleTime).toBe(0)
  })

  it('waits for a slug before asking anything', () => {
    expect(opsOptions('').enabled).toBe(false)
    expect(opsOptions('summer').enabled).toBe(true)
  })

  it('keys on the shared table, so an invalidation reaches the query', () => {
    expect(opsOptions('summer').queryKey).toEqual(queryKeys.ops('summer'))
    expect(checksOptions('summer').queryKey).toEqual(queryKeys.checks('summer'))
  })
})
