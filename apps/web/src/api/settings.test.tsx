import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from './queryKeys'
import { useSettings, useUpdateSettings } from './settings'

const { apiGet, apiPatch } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPatch: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet, apiPatch }))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue({ tiebreakWorkoutId: null })
  apiPatch.mockResolvedValue({ tiebreakWorkoutId: 7 })
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('useSettings', () => {
  it('asks the endpoint v1 asked, for the slug it was given', async () => {
    renderHook(() => useSettings('summer'), { wrapper })
    await act(async () => {})
    expect(apiGet).toHaveBeenCalledWith('/api/settings?slug=summer')
  })

  it('waits for a slug before asking anything', async () => {
    renderHook(() => useSettings(''), { wrapper })
    await act(async () => {})
    expect(apiGet).not.toHaveBeenCalled()
  })
})

describe('useUpdateSettings', () => {
  // PATCH only writes the keys it is sent, so the caller sends the one that
  // changed rather than the whole settings object.
  it('sends the slug beside the keys that changed', async () => {
    const { result } = renderHook(() => useUpdateSettings('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ tiebreakWorkoutId: 7 }))
    expect(apiPatch).toHaveBeenCalledWith('/api/settings', { slug: 'summer', tiebreakWorkoutId: 7 })
  })

  // null is a value here, not an omission: it clears the designated workout.
  it('carries a null through rather than dropping the key', async () => {
    const { result } = renderHook(() => useUpdateSettings('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ tiebreakWorkoutId: null }))
    expect(apiPatch).toHaveBeenCalledWith('/api/settings', { slug: 'summer', tiebreakWorkoutId: null })
  })

  // A toggle answers the hand: the cached value flips before the server does.
  it('flips the cached value before the server answers', async () => {
    client.setQueryData(queryKeys.settings('summer'), { showBib: true })
    let land!: (v: unknown) => void
    apiPatch.mockReturnValue(new Promise((r) => { land = r }))
    const { result } = renderHook(() => useUpdateSettings('summer'), { wrapper })
    await act(async () => { result.current.mutate({ showBib: false }) })
    expect(client.getQueryData(queryKeys.settings('summer'))).toEqual({ showBib: false })
    await act(async () => { land({}) })
  })

  it('puts the old value back when the write is refused', async () => {
    client.setQueryData(queryKeys.settings('summer'), { showBib: true })
    apiPatch.mockRejectedValue(new Error('no'))
    const { result } = renderHook(() => useUpdateSettings('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ showBib: false }).catch(() => {}))
    expect(client.getQueryData(queryKeys.settings('summer'))).toEqual({ showBib: true })
  })

  it('re-reads the settings the judge gate and the leaderboard share', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateSettings('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ showBib: false }))
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.settings('summer') })
  })

  // The tiebreak workout decides leaderboard order, so the board a screen is
  // already showing is stale the moment it changes.
  it('re-reads the leaderboard, which the tiebreak setting orders', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateSettings('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ tiebreakWorkoutId: 7 }))
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.leaderboard('summer') })
  })
})
