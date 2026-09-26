import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from './queryKeys'
import {
  useAddWorkoutLocation,
  useDeleteWorkoutLocation,
  useSaveWorkoutLocation,
  useWorkoutLocations,
} from './workoutLocations'

const { apiDel, apiGet, apiPost, apiPut } = vi.hoisted(() => ({
  apiDel: vi.fn(), apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiDel, apiGet, apiPost, apiPut }))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue([])
  apiPost.mockResolvedValue({ id: 1, name: 'Main Floor' })
  apiPut.mockResolvedValue({ id: 1, name: 'Main Floor' })
  apiDel.mockResolvedValue(undefined)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

it('reads the competitions locations', async () => {
  renderHook(() => useWorkoutLocations('summer'), { wrapper })
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/workout-locations?slug=summer'))
})

it('waits for a slug before asking', () => {
  renderHook(() => useWorkoutLocations(''), { wrapper })
  expect(apiGet).not.toHaveBeenCalled()
})

describe('writing a location', () => {
  it('adds one with the slug in the body, as the create route wants it', async () => {
    const { result } = renderHook(() => useAddWorkoutLocation('summer'), { wrapper })
    await act(() => result.current.mutateAsync('Turf Field'))
    expect(apiPost).toHaveBeenCalledWith('/api/workout-locations', { slug: 'summer', name: 'Turf Field' })
  })

  it('saves one with the slug on the query string, as the update route wants it', async () => {
    const { result } = renderHook(() => useSaveWorkoutLocation('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ id: 2, name: 'Parking Lot' }))
    expect(apiPut).toHaveBeenCalledWith('/api/workout-locations/2?slug=summer', { name: 'Parking Lot' })
  })

  it('deletes one without a body', async () => {
    const { result } = renderHook(() => useDeleteWorkoutLocation('summer'), { wrapper })
    await act(() => result.current.mutateAsync(2))
    expect(apiDel).toHaveBeenCalledWith('/api/workout-locations/2?slug=summer')
  })

  // Deleting a venue unassigns the workouts held there, so a workouts screen
  // already open is naming a place that is gone.
  it('re-reads the list and the workouts that point at it', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteWorkoutLocation('summer'), { wrapper })
    await act(() => result.current.mutateAsync(2))
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.workoutLocations('summer') })
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.workouts('summer') })
  })
})
