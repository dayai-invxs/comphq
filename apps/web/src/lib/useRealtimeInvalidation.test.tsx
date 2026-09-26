import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtimeInvalidation } from './useRealtimeInvalidation'

// One handler per .on() call, keyed by table, so a test can play the part of
// the socket and fire row events at the hook.
type Handler = () => void
const handlers = new Map<string, { filter?: string; handler: Handler }>()
const removeChannel = vi.fn()

function makeChannel() {
  const channel = {
    on: (_event: string, spec: { table: string; filter?: string }, handler: Handler) => {
      handlers.set(spec.table, { filter: spec.filter, handler })
      return channel
    },
    subscribe: vi.fn(() => channel),
  }
  return channel
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ channel: () => makeChannel(), removeChannel }),
}))

const KEYS = [['leaderboard', 'rugged'], ['checks', 'rugged']] as const

function mount() {
  const qc = new QueryClient()
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const view = renderHook(() => useRealtimeInvalidation(KEYS), {
    wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  })
  return { invalidate, view }
}

const fire = (table: string, times = 1) => {
  for (let i = 0; i < times; i++) handlers.get(table)!.handler()
}

beforeEach(() => {
  vi.useFakeTimers()
  handlers.clear()
  removeChannel.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useRealtimeInvalidation', () => {
  it('subscribes to Score, HeatCompletion, and the two checks rows of Setting', () => {
    mount()
    expect([...handlers.keys()].sort()).toEqual(['HeatCompletion', 'Score', 'Setting'])
    // Setting also holds judgePassword; the subscription must never widen
    // past the two rows the checks endpoint already serves to anyone.
    expect(handlers.get('Setting')!.filter).toBe('key=in.(athleteChecks,equipChecks)')
    expect(handlers.get('Score')!.filter).toBeUndefined()
  })

  it('invalidates every given key on the first event, immediately', () => {
    const { invalidate } = mount()
    fire('Score')
    expect(invalidate).toHaveBeenCalledTimes(KEYS.length)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEYS[0] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEYS[1] })
  })

  it('collapses a burst into the leading refetch and one trailing refetch', () => {
    const { invalidate } = mount()
    fire('Score', 25)
    // Leading edge only so far: one invalidation per key, not 25.
    expect(invalidate).toHaveBeenCalledTimes(KEYS.length)
    vi.runAllTimers()
    // The trailing edge picks up what arrived during the window.
    expect(invalidate).toHaveBeenCalledTimes(KEYS.length * 2)
  })

  it('does not fire a trailing refetch when nothing arrived during the window', () => {
    const { invalidate } = mount()
    fire('Score')
    vi.runAllTimers()
    expect(invalidate).toHaveBeenCalledTimes(KEYS.length)
  })

  it('opens a fresh window after the last one closes', () => {
    const { invalidate } = mount()
    fire('Score', 5)
    vi.runAllTimers()
    fire('HeatCompletion')
    expect(invalidate).toHaveBeenCalledTimes(KEYS.length * 3)
  })

  it('removes the channel and lets no trailing refetch outlive the unmount', () => {
    const { invalidate, view } = mount()
    fire('Score', 5)
    view.unmount()
    expect(removeChannel).toHaveBeenCalledTimes(1)
    vi.runAllTimers()
    expect(invalidate).toHaveBeenCalledTimes(KEYS.length)
  })
})
