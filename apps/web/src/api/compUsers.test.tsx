import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAddCompUser, useCompUsers, useRemoveCompUser, useSetCompUserRole } from './compUsers'
import { queryKeys } from './queryKeys'

const { apiGet, apiPost, apiPatch, apiDel } = vi.hoisted(() => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiDel: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet, apiPost, apiPatch, apiDel }))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue([])
  apiPost.mockResolvedValue({})
  apiPatch.mockResolvedValue({})
  apiDel.mockResolvedValue({})
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('useCompUsers', () => {
  it('reads the roster for the competition in the address', async () => {
    renderHook(() => useCompUsers('summer'), { wrapper })
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/comp-users?slug=summer'))
  })

  it('waits for a slug before asking', () => {
    renderHook(() => useCompUsers(''), { wrapper })
    expect(apiGet).not.toHaveBeenCalled()
  })
})

// Every write re-reads the list rather than patching it: the server decides
// whether an email became a new account or joined an existing one, so what it
// stored is not derivable from what was sent.
describe('the writers', () => {
  it('adds a user with the slug in the body, as the route reads it', async () => {
    const { result } = renderHook(() => useAddCompUser('summer'), { wrapper })
    result.current.mutate({ email: 'ada@example.com', password: 'correcthorsebattery', role: 'admin' })
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/api/comp-users', {
        slug: 'summer',
        email: 'ada@example.com',
        password: 'correcthorsebattery',
        role: 'admin',
      }),
    )
  })

  it('changes a role by user id', async () => {
    const { result } = renderHook(() => useSetCompUserRole('summer'), { wrapper })
    result.current.mutate({ userId: 'u-1', role: 'user' })
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/comp-users/u-1', { slug: 'summer', role: 'user' }),
    )
  })

  // DELETE carries no body, so the slug has to ride in the query string.
  it('removes a user with the slug in the query string', async () => {
    const { result } = renderHook(() => useRemoveCompUser('summer'), { wrapper })
    result.current.mutate('u-1')
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith('/api/comp-users/u-1?slug=summer'))
  })

  it('re-reads the roster once a write lands', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useRemoveCompUser('summer'), { wrapper })
    result.current.mutate('u-1')
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.compUsers('summer') }),
    )
  })

  it('leaves the roster alone when a write was refused', async () => {
    apiDel.mockRejectedValue(new Error('Cannot remove yourself'))
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useRemoveCompUser('summer'), { wrapper })
    result.current.mutate('u-1')
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidate).not.toHaveBeenCalled()
  })
})
