import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKeepAwake } from './useKeepAwake'

function fakeWakeLock() {
  const sentinels: { released: boolean; release: ReturnType<typeof vi.fn>; addEventListener: () => void }[] = []
  const request = vi.fn(async () => {
    const s = {
      released: false,
      release: vi.fn(async () => { s.released = true }),
      addEventListener: () => {},
    }
    sentinels.push(s)
    return s
  })
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
  return { request, sentinels }
}

afterEach(() => {
  delete (navigator as { wakeLock?: unknown }).wakeLock
})

describe('useKeepAwake', () => {
  it('asks for a screen lock on mount and releases it on unmount', async () => {
    const { request, sentinels } = fakeWakeLock()
    const { unmount } = renderHook(() => useKeepAwake())
    await act(async () => {})
    expect(request).toHaveBeenCalledWith('screen')
    unmount()
    expect(sentinels[0].release).toHaveBeenCalled()
  })

  it('asks again after the browser dropped the lock, on the next key press', async () => {
    const { request, sentinels } = fakeWakeLock()
    renderHook(() => useKeepAwake())
    await act(async () => {})
    sentinels[0].released = true
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })) })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not ask again while the lock is still held', async () => {
    const { request } = fakeWakeLock()
    renderHook(() => useKeepAwake())
    await act(async () => {})
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })) })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does nothing in a browser without the API', () => {
    expect(() => renderHook(() => useKeepAwake())).not.toThrow()
  })
})
