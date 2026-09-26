import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useImportHeats, useImportJudgeAssignments } from './imports'
import { queryKeys } from './queryKeys'

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiPost }))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const NOTHING = { imported: 0, workoutsAffected: [], errors: [] }

beforeEach(() => {
  vi.clearAllMocks()
  apiPost.mockResolvedValue({ imported: 2, workoutsAffected: [1], errors: [] })
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('useImportHeats', () => {
  it('posts the pasted CSV with the competition it belongs to', async () => {
    const { result } = renderHook(() => useImportHeats('summer'), { wrapper })
    await act(() => result.current.mutateAsync('a,b\n1,2'))
    expect(apiPost).toHaveBeenCalledWith('/api/import/heats', { slug: 'summer', csv: 'a,b\n1,2' })
  })

  // A heat import rewrites assignments for every workout in the file, so the
  // schedule and the ops board are both stale.
  it('re-reads the schedule when rows landed', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useImportHeats('summer'), { wrapper })
    await act(() => result.current.mutateAsync('csv'))
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.schedule('summer') })
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.ops('summer') })
  })

  // The route answers 200 with a list of complaints when nothing parsed, so a
  // resolved promise is not the same as a change.
  it('re-reads nothing when the file imported nothing', async () => {
    apiPost.mockResolvedValue(NOTHING)
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useImportHeats('summer'), { wrapper })
    await act(() => result.current.mutateAsync('csv'))
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('useImportJudgeAssignments', () => {
  it('posts to its own route', async () => {
    const { result } = renderHook(() => useImportJudgeAssignments('summer'), { wrapper })
    await act(() => result.current.mutateAsync('csv'))
    expect(apiPost).toHaveBeenCalledWith('/api/import/judge-assignments', { slug: 'summer', csv: 'csv' })
  })

  it('re-reads the judge schedule when rows landed', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useImportJudgeAssignments('summer'), { wrapper })
    await act(() => result.current.mutateAsync('csv'))
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.judgeSchedule('summer') })
  })
})
