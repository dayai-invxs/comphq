import { describe, expect, it } from 'vitest'
import { currentHeat, pendingHeats } from './nowHeat'
import type { Heat, OpsData, WorkoutData } from './opsHeats'

function heat(heatNumber: number, divisions: (string | null)[] = ['Rx']): Heat {
  return {
    heatNumber,
    isComplete: false,
    entries: divisions.map((divisionName, i) => ({
      athleteId: heatNumber * 100 + i,
      athleteName: `Athlete ${heatNumber}-${i}`,
      bibNumber: null,
      divisionName,
      lane: i + 1,
      scoreDisplay: null,
      tiebreakDisplay: null,
    })),
  }
}

function workout(over: Partial<WorkoutData> = {}): WorkoutData {
  return {
    id: 1,
    number: 1,
    name: 'Helen',
    status: 'active',
    locationName: 'Main floor',
    startTime: '2026-08-27T15:00:00.000Z',
    heatIntervalSecs: 600,
    timeBetweenHeatsSecs: 0,
    callTimeSecs: 600,
    walkoutTimeSecs: 120,
    heatStartOverrides: {},
    heats: [heat(1), heat(2)],
    ...over,
  }
}

const ops = (workouts: WorkoutData[]): OpsData => ({ workouts, showBib: false })

describe('pendingHeats', () => {
  it('orders every heat still to run by its start clock', () => {
    const rows = pendingHeats(ops([workout()]))
    expect(rows.map((r) => r.heat.heatNumber)).toEqual([1, 2])
    expect(rows[0].startMs).toBe(Date.parse('2026-08-27T15:00:00.000Z'))
    expect(rows[1].startMs).toBe(Date.parse('2026-08-27T15:10:00.000Z'))
  })

  it('interleaves two workouts by clock rather than by workout', () => {
    const a = workout({ id: 1, number: 1, startTime: '2026-08-27T15:00:00.000Z' })
    const b = workout({ id: 2, number: 2, name: 'Fran', startTime: '2026-08-27T15:05:00.000Z' })
    const rows = pendingHeats(ops([a, b]))
    expect(rows.map((r) => [r.workout.number, r.heat.heatNumber])).toEqual([
      [1, 1], [2, 1], [1, 2], [2, 2],
    ])
  })

  // v1's rule, and the reason walkout is read at all.
  it('drops a heat once the corral has walked it out', () => {
    const rows = pendingHeats(ops([workout()]), { '1-1': { walkout: true } })
    expect(rows.map((r) => r.heat.heatNumber)).toEqual([2])
  })

  it('ignores a workout that is not active', () => {
    expect(pendingHeats(ops([workout({ status: 'pending' })]))).toEqual([])
  })

  it('derives the corral and walk-out clocks from the start', () => {
    const [row] = pendingHeats(ops([workout()]))
    expect(row.startMs! - row.corralMs!).toBe(600_000)
    expect(row.startMs! - row.walkoutMs!).toBe(120_000)
  })

  // An unscheduled heat is not next, however low its number.
  it('sorts a workout with no start time behind the ones with a clock', () => {
    const timed = workout({ id: 1, number: 2 })
    const untimed = workout({ id: 2, number: 1, startTime: null, heats: [heat(1)] })
    const rows = pendingHeats(ops([untimed, timed]))
    expect(rows[0].workout.id).toBe(1)
    expect(rows.at(-1)!.workout.id).toBe(2)
    expect(rows.at(-1)!.corralMs).toBeNull()
  })

  it('lists each division in the heat once', () => {
    const w = workout({ heats: [heat(1, ['Rx', 'Rx', 'Scaled', null])] })
    expect(pendingHeats(ops([w]))[0].divisions).toEqual(['Rx', 'Scaled'])
  })

  it('has nothing to run before the payload lands', () => {
    expect(pendingHeats(undefined)).toEqual([])
  })
})

describe('currentHeat', () => {
  it('is the first heat still to run', () => {
    expect(currentHeat(ops([workout()]))!.heat.heatNumber).toBe(1)
  })

  it('is nothing when every heat has walked out', () => {
    const checks = { '1-1': { walkout: true }, '1-2': { walkout: true } }
    expect(currentHeat(ops([workout()]), checks)).toBeNull()
  })
})
