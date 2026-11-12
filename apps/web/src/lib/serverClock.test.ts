import { afterEach, describe, expect, it, vi } from 'vitest'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet }))

import { measureServerOffset } from './serverClock'

afterEach(() => { vi.useRealTimers() })

describe('measureServerOffset', () => {
  // The answer was made somewhere in the round trip; the middle is the best guess.
  it('measures from the middle of the request', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    apiGet.mockImplementation(async () => {
      vi.setSystemTime(10_400) // a 400 ms round trip
      return { now: 70_200 }
    })
    expect(await measureServerOffset()).toBe(60_000)
  })

  it('refuses an answer with no time in it', async () => {
    apiGet.mockResolvedValue(null)
    await expect(measureServerOffset()).rejects.toThrow()
  })
})
