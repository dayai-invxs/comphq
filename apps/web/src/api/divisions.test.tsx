import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from './queryKeys'
import {
  useAddDivision,
  useDeleteDivision,
  useDivisions,
  useImportDivisions,
  useSaveDivision,
  useReorderDivisions,
} from './divisions'

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
  apiPost.mockResolvedValue({ id: 1, name: 'RX', order: 1 })
  apiPut.mockResolvedValue({ id: 1, name: 'RX', order: 1 })
  apiDel.mockResolvedValue(undefined)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('useDivisions', () => {
  it('asks the endpoint v1 asked, for the slug it was given', async () => {
    renderHook(() => useDivisions('summer'), { wrapper })
    await act(async () => {})
    expect(apiGet).toHaveBeenCalledWith('/api/divisions?slug=summer')
  })

  it('waits for a slug before asking anything', async () => {
    renderHook(() => useDivisions(''), { wrapper })
    await act(async () => {})
    expect(apiGet).not.toHaveBeenCalled()
  })
})

describe('writing a division', () => {
  it('adds one with the slug in the body, as the create route wants it', async () => {
    const { result } = renderHook(() => useAddDivision('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ name: 'RX', order: 2 }))
    expect(apiPost).toHaveBeenCalledWith('/api/divisions', { slug: 'summer', name: 'RX', order: 2 })
  })

  it('saves one with the slug on the query string, as the update route wants it', async () => {
    const { result } = renderHook(() => useSaveDivision('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ id: 4, name: 'Scaled', order: 3 }))
    expect(apiPut).toHaveBeenCalledWith('/api/divisions/4?slug=summer', { name: 'Scaled', order: 3 })
  })

  it('deletes one without a body', async () => {
    const { result } = renderHook(() => useDeleteDivision('summer'), { wrapper })
    await act(() => result.current.mutateAsync(4))
    expect(apiDel).toHaveBeenCalledWith('/api/divisions/4?slug=summer')
  })

  // v1 moved a division by trading order values with whichever one already sat
  // at the position picked, which sent the old occupant back to where the moved
  // one came from (defect 23). Moving the first to third has to shift the two
  // it passed up one each, not fling the third to first.
  describe('moving one division to a position', () => {
    const ROWS = [
      { id: 1, name: 'RX', order: 1 },
      { id: 2, name: 'Scaled', order: 2 },
      { id: 3, name: 'Masters', order: 3 },
      { id: 4, name: 'Teens', order: 4 },
    ]

    /** The list as the next read would return it: every id at its new order. */
    const written = () => apiPut.mock.calls
      .map(([path, body]) => ({
        id: Number(/divisions\/(\d+)/.exec(path as string)?.[1]),
        order: (body as { order: number }).order,
      }))
      .sort((a, b) => a.order - b.order)

    it('shifts the divisions it passed rather than exchanging with one of them', async () => {
      const { result } = renderHook(() => useReorderDivisions('summer'), { wrapper })
      await act(() => result.current.mutateAsync({ rows: ROWS, from: 0, to: 2 }))
      expect(written()).toEqual([{ id: 2, order: 1 }, { id: 3, order: 2 }, { id: 1, order: 3 }])
    })

    it('shifts them the other way when the move is upwards', async () => {
      const { result } = renderHook(() => useReorderDivisions('summer'), { wrapper })
      await act(() => result.current.mutateAsync({ rows: ROWS, from: 3, to: 1 }))
      expect(written()).toEqual([{ id: 4, order: 2 }, { id: 2, order: 3 }, { id: 3, order: 4 }])
    })

    // The two neighbours are the one case v1 got right, and it stays right.
    it('writes only the two rows a move between neighbours changes', async () => {
      const { result } = renderHook(() => useReorderDivisions('summer'), { wrapper })
      await act(() => result.current.mutateAsync({ rows: ROWS, from: 1, to: 2 }))
      expect(written()).toEqual([{ id: 3, order: 2 }, { id: 2, order: 3 }])
    })

    // The list may not be numbered 1..n — a division deleted out of the middle
    // leaves a gap, and a reorder deals the same numbers back out rather than
    // renumbering the list behind the user.
    it('deals back the order values the list already used, gaps and all', async () => {
      const { result } = renderHook(() => useReorderDivisions('summer'), { wrapper })
      const gappy = [
        { id: 1, name: 'RX', order: 2 },
        { id: 2, name: 'Scaled', order: 7 },
        { id: 3, name: 'Masters', order: 9 },
      ]
      await act(() => result.current.mutateAsync({ rows: gappy, from: 2, to: 0 }))
      expect(written()).toEqual([{ id: 3, order: 2 }, { id: 1, order: 7 }, { id: 2, order: 9 }])
    })

    it('writes nothing when the division is put back where it was', async () => {
      const { result } = renderHook(() => useReorderDivisions('summer'), { wrapper })
      await act(() => result.current.mutateAsync({ rows: ROWS, from: 1, to: 1 }))
      expect(apiPut).not.toHaveBeenCalled()
    })

    // The pick answers the hand: the cached list moves before the writes land.
    it('reorders the cached list before the writes land', async () => {
      client.setQueryData(queryKeys.divisions('summer'), ROWS)
      let land!: (v: unknown) => void
      apiPut.mockReturnValue(new Promise((r) => { land = r }))
      const { result } = renderHook(() => useReorderDivisions('summer'), { wrapper })
      await act(async () => { result.current.mutate({ rows: ROWS, from: 0, to: 2 }) })
      expect(client.getQueryData(queryKeys.divisions('summer'))).toEqual([
        { id: 2, name: 'Scaled', order: 1 },
        { id: 3, name: 'Masters', order: 2 },
        { id: 1, name: 'RX', order: 3 },
        { id: 4, name: 'Teens', order: 4 },
      ])
      await act(async () => { land({}) })
    })

    it('puts the cached list back when a write is refused', async () => {
      client.setQueryData(queryKeys.divisions('summer'), ROWS)
      apiPut.mockRejectedValue(new Error('no'))
      const { result } = renderHook(() => useReorderDivisions('summer'), { wrapper })
      await act(() => result.current.mutateAsync({ rows: ROWS, from: 0, to: 2 }).catch(() => {}))
      expect(client.getQueryData(queryKeys.divisions('summer'))).toEqual(ROWS)
    })
  })

  it('re-reads the list after every write', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useAddDivision('summer'), { wrapper })
    await act(() => result.current.mutateAsync({ name: 'RX', order: 2 }))
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.divisions('summer') })
  })

  // A deleted division unassigns the athletes in it, and the heat running
  // order is division order, so the roster and the board both go stale.
  it('re-reads the athletes and the board a division decides the order of', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteDivision('summer'), { wrapper })
    await act(() => result.current.mutateAsync(4))
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.athletes('summer') })
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.leaderboard('summer') })
  })
})

// COM-109. A pasted list is one write per division, in list order, each with
// the order it was handed. A refusal does not stop the rest, and the list is
// re-read either way so what did land shows.
describe('importing divisions', () => {
  it('adds each division in turn, with its own order', async () => {
    const { result } = renderHook(() => useImportDivisions('summer'), { wrapper })
    await act(() => result.current.mutateAsync([{ name: 'RX', order: 4 }, { name: 'Scaled', order: 5 }]))
    expect(apiPost.mock.calls).toEqual([
      ['/api/divisions', { slug: 'summer', name: 'RX', order: 4 }],
      ['/api/divisions', { slug: 'summer', name: 'Scaled', order: 5 }],
    ])
  })

  it('re-reads the list even when one is refused', async () => {
    apiPost.mockRejectedValueOnce(new Error('exists'))
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useImportDivisions('summer'), { wrapper })
    await act(() => expect(result.current.mutateAsync([{ name: 'RX', order: 4 }, { name: 'Scaled', order: 5 }]))
      .rejects.toThrow('Could not add "RX" (exists)'))
    expect(apiPost).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.divisions('summer') })
  })
})
