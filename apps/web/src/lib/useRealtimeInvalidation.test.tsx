import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtimeInvalidation } from './useRealtimeInvalidation'

// The test plays the part of the socket: it records which channel was opened
// and what was listened for, and fires announcements at the hook.
type Handler = () => void
const opened: string[] = []
const listens: { type: string; event: string }[] = []
let announce: Handler = () => {}
const removeChannel = vi.fn()

function makeChannel(topic: string) {
  opened.push(topic)
  const channel = {
    on: (type: string, spec: { event: string }, handler: Handler) => {
      listens.push({ type, event: spec.event })
      announce = handler
      return channel
    },
    subscribe: vi.fn(() => channel),
  }
  return channel
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ channel: (topic: string) => makeChannel(topic), removeChannel }),
}))

const KEYS = [['leaderboard', 'rugged'], ['checks', 'rugged']] as const

function mount(slug = 'rugged') {
  const qc = new QueryClient()
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const view = renderHook(() => useRealtimeInvalidation(slug, KEYS), {
    wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  })
  return { invalidate, view }
}

const fire = (times = 1) => {
  for (let i = 0; i < times; i++) announce()
}

beforeEach(() => {
  vi.useFakeTimers()
  opened.length = 0
  listens.length = 0
  announce = () => {}
  removeChannel.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useRealtimeInvalidation', () => {
  // One competition's scoring used to reload every competition's screens.
  it('listens only on its own competition\'s channel', () => {
    mount('rugged')
    expect(opened).toEqual(['competition:rugged'])
    expect(listens).toEqual([{ type: 'broadcast', event: 'changed' }])
  })

  it('listens to nothing without a competition', () => {
    mount('')
    expect(opened).toEqual([])
  })

  it('invalidates every given key on the first event, immediately', () => {
    const { invalidate } = mount()
    fire()
    expect(invalidate).toHaveBeenCalledTimes(KEYS.length)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEYS[0] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEYS[1] })
  })

  it('collapses a burst into the leading refetch and one trailing refetch', () => {
    const { invalidate } = mount()
    fire(25)
    // Leading edge only so far: one invalidation per key, not 25.
    expect(invalidate).toHaveBeenCalledTimes(KEYS.length)
    vi.runAllTimers()
    // The trailing edge picks up what arrived during the window.
    expect(invalidate).toHaveBeenCalledTimes(KEYS.length * 2)
  })

  it('does not fire a trailing refetch when nothing arrived during the window', () => {
    const { invalidate } = mount()
    fire()
    vi.runAllTimers()
    expect(invalidate).toHaveBeenCalledTimes(KEYS.length)
  })

  it('opens a fresh window after the last one closes', () => {
    const { invalidate } = mount()
    fire(5)
    vi.runAllTimers()
    fire()
    expect(invalidate).toHaveBeenCalledTimes(KEYS.length * 3)
  })

  it('removes the channel and lets no trailing refetch outlive the unmount', () => {
    const { invalidate, view } = mount()
    fire(5)
    view.unmount()
    expect(removeChannel).toHaveBeenCalledTimes(1)
    vi.runAllTimers()
    expect(invalidate).toHaveBeenCalledTimes(KEYS.length)
  })
})
