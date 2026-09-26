import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from './queryKeys'
import { useSetScorePoints } from './scores'

const { apiPatch } = vi.hoisted(() => ({ apiPatch: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiPatch }))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  apiPatch.mockResolvedValue(undefined)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('useSetScorePoints', () => {
  // The slug rides twice — in the query string the route reads for the
  // competition, and in the body its schema validates. v1 sent both.
  it('patches the workouts scores with the slug in the query and the body', async () => {
    const { result } = renderHook(() => useSetScorePoints('summer'), { wrapper })
    result.current.mutate({ workoutId: 4, athleteId: 9, points: 2 })
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/workouts/4/scores?slug=summer', {
        slug: 'summer',
        athleteId: 9,
        points: 2,
      }),
    )
  })

  // Overriding a placing changes the standings under it, and the API is what
  // ranks — v1 re-read the whole board after the write rather than guessing.
  it('re-reads the board once the override lands', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSetScorePoints('summer'), { wrapper })
    result.current.mutate({ workoutId: 4, athleteId: 9, points: 2 })
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.leaderboard('summer') }),
    )
  })

  it('does not re-read when the write was refused', async () => {
    apiPatch.mockRejectedValue(new Error('Forbidden'))
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSetScorePoints('summer'), { wrapper })
    result.current.mutate({ workoutId: 4, athleteId: 9, points: 2 })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidate).not.toHaveBeenCalled()
  })
})
