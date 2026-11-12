import { describe, it, expect } from 'vitest'
import { calcHeatStartMs, shiftHeatStartOverrides } from './heatTime'

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

// A workout moved to another day takes its edited heats with it.
describe('shiftHeatStartOverrides', () => {
  const overrides = { '2': '2026-11-14T19:05:00.000Z', '4': '2026-11-14T20:00:00.000Z' }

  it('moves every override by however far the start moved', () => {
    expect(shiftHeatStartOverrides(overrides, '2026-11-14T18:00:00.000Z', '2026-11-11T18:30:00.000Z')).toEqual({
      '2': '2026-11-11T19:35:00.000Z', '4': '2026-11-11T20:30:00.000Z',
    })
  })

  it('reads the legacy string form', () => {
    expect(shiftHeatStartOverrides(JSON.stringify(overrides), '2026-11-14T18:00:00.000Z', '2026-11-14T18:10:00.000Z'))
      .toEqual({ '2': '2026-11-14T19:15:00.000Z', '4': '2026-11-14T20:10:00.000Z' })
  })

  it('leaves nothing to do when the start did not move, there are no overrides, or a start is missing', () => {
    expect(shiftHeatStartOverrides(overrides, '2026-11-14T18:00:00.000Z', '2026-11-14T18:00:00+00:00')).toBeNull()
    expect(shiftHeatStartOverrides({}, '2026-11-14T18:00:00.000Z', '2026-11-11T18:00:00.000Z')).toBeNull()
    expect(shiftHeatStartOverrides(overrides, null, '2026-11-11T18:00:00.000Z')).toBeNull()
    expect(shiftHeatStartOverrides(overrides, '2026-11-14T18:00:00.000Z', null)).toBeNull()
  })
})
