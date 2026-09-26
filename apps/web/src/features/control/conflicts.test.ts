import { describe, expect, it } from 'vitest'
import type { WorkoutData } from '@/lib/opsHeats'
import { findConflicts } from './conflicts'

const workout = (over: Partial<WorkoutData> & Pick<WorkoutData, 'id'>): WorkoutData => ({
  number: 1,
  name: 'Fran',
  status: 'active',
  locationName: null,
  startTime: '2026-08-26T09:00:00.000Z',
  heatIntervalSecs: 600,
  timeBetweenHeatsSecs: 0,
  callTimeSecs: 300,
  walkoutTimeSecs: 120,
  heatStartOverrides: {},
  heats: [
    { heatNumber: 1, isComplete: false, entries: [] },
    { heatNumber: 2, isComplete: false, entries: [] },
  ],
  ...over,
})

describe('findConflicts', () => {
  // 09:00 and 09:10 against 11:00 and 11:10 — two hours clear.
  it('flags nothing when the workouts are well apart', () => {
    const conflicts = findConflicts([
      workout({ id: 7 }),
      workout({ id: 8, number: 2, startTime: '2026-08-26T11:00:00.000Z' }),
    ])
    expect(conflicts.size).toBe(0)
  })

  // The second workout opens at 09:10, which is when heat 2 of the first one
  // is due to start.
  it('flags a heat that runs into the workout after it', () => {
    const conflicts = findConflicts([
      workout({ id: 7 }),
      workout({ id: 8, number: 2, startTime: '2026-08-26T09:10:00.000Z' }),
    ])
    expect([...conflicts]).toContain('7-2')
  })

  it('flags a heat that runs back into the workout before it', () => {
    const conflicts = findConflicts([
      workout({ id: 7, startTime: '2026-08-26T09:00:00.000Z' }),
      workout({ id: 8, number: 2, startTime: '2026-08-26T09:10:00.000Z' }),
    ])
    // 09:10 is the first workout's last heat as well as the second's first.
    expect([...conflicts]).toContain('8-1')
  })

  // The first workout walks its last heat out at 09:08, and the second calls
  // its first corral at 09:10 — inside the two minutes it takes to clear a
  // floor, even though no start time overlaps.
  it('flags a corral called on top of the last walk-out', () => {
    const conflicts = findConflicts([
      workout({ id: 7 }),
      workout({ id: 8, number: 2, startTime: '2026-08-26T09:15:00.000Z' }),
    ])
    expect([...conflicts]).toContain('8-1')
  })

  it('flags nothing in a workout with no start time', () => {
    const conflicts = findConflicts([
      workout({ id: 7, startTime: null }),
      workout({ id: 8, number: 2, startTime: null }),
    ])
    expect(conflicts.size).toBe(0)
  })

  // Only the neighbouring workout is compared. The third workout here sits on
  // top of the first, and the first is never told: v1 looked one step in each
  // direction and no further, and that blind spot is kept.
  it('looks no further than the workout on either side', () => {
    const conflicts = findConflicts([
      workout({ id: 7, startTime: '2026-08-26T09:00:00.000Z' }),
      workout({ id: 8, number: 2, startTime: '2026-08-26T20:00:00.000Z' }),
      workout({ id: 9, number: 3, startTime: '2026-08-26T09:05:00.000Z' }),
    ])
    expect([...conflicts].filter((k) => k.startsWith('7-'))).toEqual([])
  })

  it('flags nothing when a workout has no heats to compare', () => {
    const conflicts = findConflicts([
      workout({ id: 7, heats: [] }),
      workout({ id: 8, number: 2, startTime: '2026-08-26T09:00:00.000Z' }),
    ])
    expect(conflicts.size).toBe(0)
  })
})
