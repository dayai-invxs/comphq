import { describe, expect, it } from 'vitest'
import { getCorralMs, getHeatMs, getWalkoutMs, type WorkoutData } from './opsHeats'

const workout = (over: Partial<WorkoutData> = {}): WorkoutData => ({
  id: 1,
  number: 1,
  name: 'Fran',
  status: 'active',
  locationName: null,
  startTime: '2026-05-01T10:00:00.000Z',
  heatIntervalSecs: 300,
  timeBetweenHeatsSecs: 60,
  callTimeSecs: 0,
  walkoutTimeSecs: 0,
  heatStartOverrides: {},
  heats: [],
  ...over,
})

describe('getHeatMs', () => {
  it('offsets by the interval plus the gap between heats', () => {
    const start = Date.parse('2026-05-01T10:00:00.000Z')
    expect(getHeatMs(workout(), 1)).toBe(start)
    expect(getHeatMs(workout(), 3)).toBe(start + 2 * 360_000)
  })

  it('anchors on an override and cascades from it', () => {
    const w = workout({ heatStartOverrides: { 3: '2026-05-01T11:00:00.000Z' } })
    expect(getHeatMs(w, 3)).toBe(Date.parse('2026-05-01T11:00:00.000Z'))
    expect(getHeatMs(w, 4)).toBe(Date.parse('2026-05-01T11:06:00.000Z'))
  })

  it('has no time to give when the workout has no start time', () => {
    expect(getHeatMs(workout({ startTime: null }), 1)).toBeNull()
  })
})

describe('getCorralMs and getWalkoutMs', () => {
  const start = Date.parse('2026-05-01T10:00:00.000Z')
  const w = workout({ callTimeSecs: 600, walkoutTimeSecs: 120 })

  it('counts the call and walk out offsets back from the heat start', () => {
    expect(getCorralMs(w, start)).toBe(start - 600_000)
    expect(getWalkoutMs(w, start)).toBe(start - 120_000)
  })

  it('has no time to give when the heat has none', () => {
    expect(getCorralMs(w, null)).toBeNull()
    expect(getWalkoutMs(w, null)).toBeNull()
  })
})
