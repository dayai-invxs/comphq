import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http'
import { applyErrors, useCcApply, useCcPreview } from './competitionCorner'
import { queryKeys } from './queryKeys'

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiPost }))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const SOURCE = { url: 'https://competitioncorner.net/events/19948', tz: 'America/Los_Angeles', mergePartB: true }

beforeEach(() => {
  vi.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('useCcPreview', () => {
  it('posts the event link with the competition it is for', async () => {
    apiPost.mockResolvedValue({ event: { id: 1, name: 'E' }, changes: [], version: 'v' })
    const { result } = renderHook(() => useCcPreview('summer'), { wrapper })
    await act(() => result.current.mutateAsync(SOURCE))
    expect(apiPost).toHaveBeenCalledWith('/api/import/competition-corner/preview', { slug: 'summer', ...SOURCE })
  })
})

describe('useCcApply', () => {
  const selection = { version: 'v', accepted: ['division:1'], scoreTypes: {} }

  it('posts the source with the accepted changes', async () => {
    apiPost.mockResolvedValue({ applied: 1 })
    const { result } = renderHook(() => useCcApply('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ ...SOURCE, ...selection }))
    expect(apiPost).toHaveBeenCalledWith('/api/import/competition-corner/apply', { slug: 'summer', ...SOURCE, ...selection })
  })

  // An import can touch every roster the admin screens read.
  it('re-reads what an import writes', async () => {
    apiPost.mockResolvedValue({ applied: 1 })
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCcApply('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ ...SOURCE, ...selection }))
    for (const key of [
      queryKeys.divisions('summer'), queryKeys.workouts('summer'), queryKeys.workoutLocations('summer'),
      queryKeys.athletes('summer'), queryKeys.schedule('summer'), queryKeys.ops('summer'),
    ]) expect(spy).toHaveBeenCalledWith({ queryKey: key })
  })
})

describe('applyErrors', () => {
  it('lists each selection problem the route returned', () => {
    const e = new HttpError(400, JSON.stringify({ errors: ['Ann needs Rx too.', 'Pick a score type for WOD 1.'] }))
    expect(applyErrors(e)).toEqual(['Ann needs Rx too.', 'Pick a score type for WOD 1.'])
  })

  it('falls back to the message for anything else', () => {
    expect(applyErrors(new HttpError(409, 'Preview again.'))).toEqual(['Preview again.'])
    expect(applyErrors(new Error('offline'))).toEqual(['offline'])
  })
})
