import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http'
import { applyErrors, useCcApply, useCcPreview } from './competitionCorner'
import { queryKeys } from './queryKeys'

const { apiPost, fetchCcEvent } = vi.hoisted(() => ({ apiPost: vi.fn(), fetchCcEvent: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiPost }))
vi.mock('@/lib/competitionCorner', async (actual) => ({
  ...(await actual<typeof import('@/lib/competitionCorner')>()),
  fetchCcEvent,
}))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const SOURCE = { url: 'https://competitioncorner.net/events/19948', tz: 'America/Los_Angeles', mergePartB: true }
const EVENT = { id: 19948, name: 'Rugged Rumble', divisions: [], workouts: [], heats: [] }
const REQUEST = { tz: 'America/Los_Angeles', mergePartB: true, event: EVENT }

beforeEach(() => {
  vi.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('useCcPreview', () => {
  // The browser reads the event: Competition Corner refuses the Edge Functions.
  it('reads the event in the browser and posts it with the competition', async () => {
    fetchCcEvent.mockResolvedValue(EVENT)
    apiPost.mockResolvedValue({ event: { id: 19948, name: 'Rugged Rumble' }, changes: [], version: 'v' })
    const { result } = renderHook(() => useCcPreview('summer'), { wrapper })

    const preview = await act(() => result.current.mutateAsync(SOURCE))

    expect(fetchCcEvent).toHaveBeenCalledWith(19948)
    expect(apiPost).toHaveBeenCalledWith('/api/import/competition-corner/preview', { slug: 'summer', ...REQUEST })
    expect(preview.request).toEqual(REQUEST)
  })

  it('asks for an event link before reading anything', async () => {
    const { result } = renderHook(() => useCcPreview('summer'), { wrapper })

    await expect(act(() => result.current.mutateAsync({ ...SOURCE, url: 'https://example.com/19948' }))).rejects.toThrow(
      'Paste a Competition Corner event link, like competitioncorner.net/events/12345.',
    )
    expect(fetchCcEvent).not.toHaveBeenCalled()
    expect(apiPost).not.toHaveBeenCalled()
  })
})

describe('useCcApply', () => {
  const selection = { version: 'v', accepted: ['division:1'], scoreTypes: {} }

  it('posts the previewed event with the accepted changes', async () => {
    apiPost.mockResolvedValue({ applied: 1 })
    const { result } = renderHook(() => useCcApply('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ ...REQUEST, ...selection }))
    expect(apiPost).toHaveBeenCalledWith('/api/import/competition-corner/apply', { slug: 'summer', ...REQUEST, ...selection })
  })

  // An import can touch every roster the admin screens read.
  it('re-reads what an import writes', async () => {
    apiPost.mockResolvedValue({ applied: 1 })
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCcApply('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ ...REQUEST, ...selection }))
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
    expect(applyErrors(new HttpError(500, JSON.stringify({ error: 'Database is busy' })))).toEqual(['Database is busy'])
  })
})
