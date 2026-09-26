import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setViewport } from '@/test/matchMedia'
import { useMediaQuery } from './useMediaQuery'

describe('useMediaQuery', () => {
  it('answers the query the caller asked', () => {
    setViewport(375)
    const { result } = renderHook(() => useMediaQuery('(min-width: 600px)'))
    expect(result.current).toBe(false)
  })

  it('answers true once the query matches', () => {
    setViewport(900)
    const { result } = renderHook(() => useMediaQuery('(min-width: 600px)'))
    expect(result.current).toBe(true)
  })

  // A phone turned on its side is the same reader, and the layout has to
  // follow it without a reload.
  it('follows the viewport as it changes', () => {
    setViewport(375)
    const { result } = renderHook(() => useMediaQuery('(min-width: 600px)'))
    act(() => setViewport(900))
    expect(result.current).toBe(true)
  })

  it('stops listening once the caller is gone', () => {
    setViewport(375)
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 600px)'))
    unmount()
    act(() => setViewport(900))
    expect(result.current).toBe(false)
  })
})
