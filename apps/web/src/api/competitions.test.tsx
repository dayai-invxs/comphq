import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCompetitions, useCreateCompetition, useDeleteCompetition, useMyCompetitions } from './competitions'
import { queryKeys } from './queryKeys'

const { apiGet, apiPost, apiDel } = vi.hoisted(() => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiDel: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet, apiPost, apiDel }))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue([])
  apiPost.mockResolvedValue({ id: 1, name: 'Summer', slug: 'summer' })
  apiDel.mockResolvedValue(undefined)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('reads', () => {
  it('lists every competition, which v1 serves to anyone', async () => {
    renderHook(() => useCompetitions(), { wrapper })
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/competitions'))
  })

  it('holds the public list until the caller says to ask', () => {
    renderHook(() => useCompetitions(false), { wrapper })
    expect(apiGet).not.toHaveBeenCalled()
  })

  it('reads the members own competitions from a different endpoint', async () => {
    renderHook(() => useMyCompetitions(true), { wrapper })
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/competitions/mine'))
  })
})

describe('useCreateCompetition', () => {
  it('posts the name and slug and hands back what the server made', async () => {
    const { result } = renderHook(() => useCreateCompetition(), { wrapper })
    // The page navigates to the slug the server settled on, so the awaited
    // value is the part that matters, not the cached mutation state.
    let created: unknown
    await act(async () => { created = await result.current.mutateAsync({ name: 'Summer', slug: 'summer' }) })
    expect(apiPost).toHaveBeenCalledWith('/api/competitions', { name: 'Summer', slug: 'summer' })
    expect(created).toEqual({ id: 1, name: 'Summer', slug: 'summer' })
  })

  // The server cleans the slug it was sent and the creator becomes its admin,
  // so both lists are stale the moment this returns.
  it('clears both competition lists on success', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateCompetition(), { wrapper })
    await act(() => result.current.mutateAsync({ name: 'Summer', slug: 'summer' }))
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.competitions })
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.myCompetitions })
  })

  it('leaves the lists alone when the server refuses the slug', async () => {
    apiPost.mockRejectedValue(new Error('Slug must be alphanumeric (dashes allowed internally)'))
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateCompetition(), { wrapper })
    await act(async () => { await result.current.mutateAsync({ name: '!', slug: '!' }).catch(() => {}) })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('useDeleteCompetition', () => {
  it('deletes by id, not by slug', async () => {
    const { result } = renderHook(() => useDeleteCompetition(), { wrapper })
    await act(() => result.current.mutateAsync(7))
    expect(apiDel).toHaveBeenCalledWith('/api/competitions/7')
  })

  it('clears both competition lists on success', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteCompetition(), { wrapper })
    await act(() => result.current.mutateAsync(7))
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.competitions })
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.myCompetitions })
  })

  it('leaves the lists alone when the delete is refused', async () => {
    apiDel.mockRejectedValue(new Error('Forbidden'))
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteCompetition(), { wrapper })
    await act(async () => { await result.current.mutateAsync(7).catch(() => {}) })
    expect(spy).not.toHaveBeenCalled()
  })
})
