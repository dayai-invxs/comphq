import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from './queryKeys'
import {
  useAddVolunteerRole,
  useDeleteVolunteerRole,
  useImportVolunteerRoles,
  useSaveVolunteerRole,
  useVolunteerRoles,
} from './volunteerRoles'

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
  apiPost.mockResolvedValue({ id: 1, name: 'Judge' })
  apiPut.mockResolvedValue({ id: 1, name: 'Judge' })
  apiDel.mockResolvedValue(undefined)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('useVolunteerRoles', () => {
  it('asks the endpoint v1 asked, for the slug it was given', async () => {
    renderHook(() => useVolunteerRoles('summer'), { wrapper })
    await act(async () => {})
    expect(apiGet).toHaveBeenCalledWith('/api/volunteer-roles?slug=summer')
  })

  it('waits for a slug before asking anything', async () => {
    renderHook(() => useVolunteerRoles(''), { wrapper })
    await act(async () => {})
    expect(apiGet).not.toHaveBeenCalled()
  })
})

describe('writing a volunteer role', () => {
  it('adds one with the slug in the body, as the create route wants it', async () => {
    const { result } = renderHook(() => useAddVolunteerRole('summer'), { wrapper })
    await act(() => result.current.mutateAsync('Timer'))
    expect(apiPost).toHaveBeenCalledWith('/api/volunteer-roles', { slug: 'summer', name: 'Timer' })
  })

  it('saves one with the slug on the query string, as the update route wants it', async () => {
    const { result } = renderHook(() => useSaveVolunteerRole('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ id: 3, name: 'Scorekeeper' }))
    expect(apiPut).toHaveBeenCalledWith('/api/volunteer-roles/3?slug=summer', { name: 'Scorekeeper' })
  })

  it('deletes one without a body', async () => {
    const { result } = renderHook(() => useDeleteVolunteerRole('summer'), { wrapper })
    await act(() => result.current.mutateAsync(3))
    expect(apiDel).toHaveBeenCalledWith('/api/volunteer-roles/3?slug=summer')
  })

  it('re-reads the list after every write', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useAddVolunteerRole('summer'), { wrapper })
    await act(() => result.current.mutateAsync('Timer'))
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.volunteerRoles('summer') })
  })
})

// COM-110. A pasted list of roles is one POST per name, and a refusal still
// re-reads the list so the ones that landed show.
describe('importing volunteer roles', () => {
  it('adds each role in turn', async () => {
    const { result } = renderHook(() => useImportVolunteerRoles('summer'), { wrapper })
    await act(() => result.current.mutateAsync(['Judge', 'Timer']))
    expect(apiPost.mock.calls).toEqual([
      ['/api/volunteer-roles', { slug: 'summer', name: 'Judge' }],
      ['/api/volunteer-roles', { slug: 'summer', name: 'Timer' }],
    ])
  })

  it('re-reads the list even when one is refused', async () => {
    apiPost.mockRejectedValueOnce(new Error('exists'))
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useImportVolunteerRoles('summer'), { wrapper })
    await act(() => expect(result.current.mutateAsync(['Judge', 'Timer']))
      .rejects.toThrow('Could not add "Judge" (exists)'))
    expect(apiPost).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.volunteerRoles('summer') })
  })
})
