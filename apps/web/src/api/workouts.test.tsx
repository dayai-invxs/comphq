import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from './queryKeys'
import { useCreateWorkout, workoutsOptions } from './workouts'

const { apiGet, apiPost } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet, apiPost }))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const DRAFT = {
  number: 3,
  name: 'Fran',
  description: null,
  scoreType: 'time',
  lanes: 5,
  heatIntervalSecs: 600,
  timeBetweenHeatsSecs: 120,
  callTimeSecs: 600,
  walkoutTimeSecs: 120,
  startTime: null,
  mixedHeats: true,
  tiebreakEnabled: false,
  tiebreakScoreType: 'time',
  partBEnabled: false,
  partBScoreType: 'time',
  halfWeight: false,
  locationId: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  apiPost.mockResolvedValue({ id: 9, ...DRAFT })
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('workout reads', () => {
  it('asks the endpoint v1 asked, for the slug it was given', () => {
    workoutsOptions('summer').queryFn()
    expect(apiGet).toHaveBeenCalledWith('/api/workouts?slug=summer')
  })

  it('keys on the shared table, so a mutation can clear it by name', () => {
    expect(workoutsOptions('summer').queryKey).toEqual(queryKeys.workouts('summer'))
  })

  it('waits for a slug before asking anything', () => {
    expect(workoutsOptions('').enabled).toBe(false)
    expect(workoutsOptions('summer').enabled).toBe(true)
  })
})

describe('useCreateWorkout', () => {
  it('sends the draft with the competition it belongs to', async () => {
    const { result } = renderHook(() => useCreateWorkout('summer'), { wrapper })
    await act(() => result.current.mutateAsync(DRAFT))
    expect(apiPost).toHaveBeenCalledWith('/api/workouts', { slug: 'summer', ...DRAFT })
  })

  it('re-reads the workout list the screen draws', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateWorkout('summer'), { wrapper })
    await act(() => result.current.mutateAsync(DRAFT))
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.workouts('summer') })
  })

  // A new workout is a new column on the public schedule, before it has a
  // single heat in it.
  it('re-reads the schedule, which lists every workout', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateWorkout('summer'), { wrapper })
    await act(() => result.current.mutateAsync(DRAFT))
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.schedule('summer') })
  })

  // A duplicate number answers 409 with a message the screen shows as-is, so
  // the rejection has to reach the caller rather than resolve quietly.
  it('rejects with what the server refused rather than swallowing it', async () => {
    apiPost.mockRejectedValue(new Error('Workout number 3 already exists in this competition.'))
    const { result } = renderHook(() => useCreateWorkout('summer'), { wrapper })
    let refusal: unknown
    await act(async () => {
      refusal = await result.current.mutateAsync(DRAFT).catch((e) => e)
    })
    expect(refusal).toEqual(new Error('Workout number 3 already exists in this competition.'))
  })
})
