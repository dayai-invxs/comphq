import { describe, it, expect } from 'vitest'
import { calcHeatStartMs } from './heatTime'

describe('calcHeatStartMs', () => {
  it('returns null when workoutStartTime is null', () => {
    expect(calcHeatStartMs(1, null, 600, '{}')).toBeNull()
  })

  it('computes heat 1 at workoutStartTime exactly', () => {
    const t = '2026-04-20T10:00:00Z'
    expect(calcHeatStartMs(1, t, 600, '{}')).toBe(new Date(t).getTime())
  })

  it('adds heatIntervalSecs for each subsequent heat (no between-time)', () => {
    const t = '2026-04-20T10:00:00Z'
    const base = new Date(t).getTime()
    expect(calcHeatStartMs(3, t, 600, '{}', 0)).toBe(base + 2 * 600 * 1000)
  })

  it('adds timeBetweenHeatsSecs gap between heats', () => {
    const t = '2026-04-20T10:00:00Z'
    const base = new Date(t).getTime()
    expect(calcHeatStartMs(2, t, 600, '{}', 120)).toBe(base + (600 + 120) * 1000)
  })

  it('uses override as anchor and cascades forward', () => {
    const t = '2026-04-20T10:00:00Z'
    const override = '2026-04-20T11:00:00Z'
    const overrides = JSON.stringify({ '3': override })
    expect(calcHeatStartMs(3, t, 600, overrides, 0)).toBe(new Date(override).getTime())
    expect(calcHeatStartMs(4, t, 600, overrides, 0)).toBe(new Date(override).getTime() + 600_000)
  })

  it('ignores overrides later than requested heat', () => {
    const t = '2026-04-20T10:00:00Z'
    const overrides = JSON.stringify({ '5': '2026-04-20T20:00:00Z' })
    expect(calcHeatStartMs(2, t, 600, overrides, 0)).toBe(new Date(t).getTime() + 600_000)
  })
})
