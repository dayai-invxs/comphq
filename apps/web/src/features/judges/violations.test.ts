import { describe, expect, it } from 'vitest'
import { findViolations, type JudgeWorkout } from './violations'

const heat = (heatNumber: number, judgeIds: number[]): JudgeWorkout['heats'][number] => ({
  heatNumber,
  heatTimeMs: null,
  walkoutTimeMs: null,
  assignments: judgeIds.map((judgeId, i) => ({ judgeId, judgeName: `Judge ${judgeId}`, lane: i + 1 })),
})

const workout = (id: number, heats: JudgeWorkout['heats']): JudgeWorkout => ({
  id,
  number: id,
  name: `Workout ${id}`,
  locationName: null,
  heats,
})

describe('findViolations', () => {
  it('marks nothing while the run is inside the limit', () => {
    const wk = workout(1, [heat(1, [7]), heat(2, [7]), heat(3, [7])])
    expect(findViolations([wk], 3).size).toBe(0)
  })

  it('marks every heat past the limit, not just the first', () => {
    const wk = workout(1, [heat(1, [7]), heat(2, [7]), heat(3, [7]), heat(4, [7]), heat(5, [7])])
    expect([...findViolations([wk], 3)]).toEqual(['1-7-4', '1-7-5'])
  })

  // A heat off is a rest, and the count starts again after it.
  it('starts the count again after a gap', () => {
    const wk = workout(1, [heat(1, [7]), heat(2, [7]), heat(4, [7]), heat(5, [7])])
    expect(findViolations([wk], 2).size).toBe(0)
  })

  it('counts each judge on their own', () => {
    const wk = workout(1, [heat(1, [7, 8]), heat(2, [7, 8]), heat(3, [7])])
    expect([...findViolations([wk], 2)]).toEqual(['1-7-3'])
  })

  // The changeover between workouts is a rest, whatever the heat numbers say.
  it('does not carry a run from one workout into the next', () => {
    const a = workout(1, [heat(1, [7]), heat(2, [7])])
    const b = workout(2, [heat(3, [7]), heat(4, [7])])
    expect(findViolations([a, b], 2).size).toBe(0)
  })
})
