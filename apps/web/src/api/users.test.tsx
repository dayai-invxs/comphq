import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreateUser, useDeleteUser, useSendPasswordReset, useUpdateUser, useUsers } from './users'
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
  apiPost.mockResolvedValue({ ok: true })
  apiPatch.mockResolvedValue({ ok: true })
  apiDel.mockResolvedValue({ ok: true })
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('useUsers', () => {
  it('reads every account on the site', async () => {
    renderHook(() => useUsers(), { wrapper })
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/users'))
  })
})

describe('writes', () => {
  it('creates a user with the memberships that were ticked', async () => {
    const { result } = renderHook(() => useCreateUser(), { wrapper })
    await act(() => result.current.mutateAsync({
      email: 'ada@example.com', password: 'a-long-password', isSuper: false, competitionIds: [4, 9],
    }))
    expect(apiPost).toHaveBeenCalledWith('/api/users', {
      email: 'ada@example.com', password: 'a-long-password', isSuper: false, competitionIds: [4, 9],
    })
  })

  // PATCH replaces the membership set outright, so the list sent is the list
  // the user ends up with — not the ones being added.
  it('sends the whole membership set on an edit', async () => {
    const { result } = renderHook(() => useUpdateUser(), { wrapper })
    await act(() => result.current.mutateAsync({ userId: 'u-1', isSuper: false, competitionIds: [9] }))
    expect(apiPatch).toHaveBeenCalledWith('/api/users/u-1', { isSuper: false, competitionIds: [9] })
  })

  it('deletes by id', async () => {
    const { result } = renderHook(() => useDeleteUser(), { wrapper })
    await act(() => result.current.mutateAsync('u-1'))
    expect(apiDel).toHaveBeenCalledWith('/api/users/u-1')
  })

  for (const [name, hook] of [
    ['create', useCreateUser],
    ['update', useUpdateUser],
    ['delete', useDeleteUser],
  ] as const) {
    it(`re-reads the list after a ${name}`, async () => {
      const spy = vi.spyOn(client, 'invalidateQueries')
      const { result } = renderHook(() => hook(), { wrapper })
      await act(async () => {
        // Every writer takes a different argument; none of them read it here.
        await (result.current.mutateAsync as (input: never) => Promise<unknown>)('u-1' as never)
      })
      expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.users })
    })
  }
})

describe('useSendPasswordReset', () => {
  it('asks the server to mail the link, and sends no password itself', async () => {
    const { result } = renderHook(() => useSendPasswordReset(), { wrapper })
    await act(() => result.current.mutateAsync('u-1'))
    expect(apiPost).toHaveBeenCalledWith('/api/users/u-1/reset-password', {})
  })

  // Nothing about the account changed — the mail is the whole effect.
  it('does not re-read the list', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSendPasswordReset(), { wrapper })
    await act(() => result.current.mutateAsync('u-1'))
    expect(spy).not.toHaveBeenCalled()
  })
})
