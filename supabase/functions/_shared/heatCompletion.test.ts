import { describe, it, expect } from 'vitest'
import { drizzleMock as mock } from '@/test/setup'
import { getCompletedHeats, getCompletedHeatsByWorkout } from './heatCompletion'

describe('getCompletedHeats', () => {
  it('returns sorted heat numbers for a workout', async () => {
    mock.queueResult([{ heatNumber: 3 }, { heatNumber: 1 }, { heatNumber: 2 }])
    const result = await getCompletedHeats(7)
    expect(result).toEqual([1, 2, 3])
  })

  it('returns [] when no completions exist', async () => {
    mock.queueResult([])
    expect(await getCompletedHeats(99)).toEqual([])
  })
})

describe('getCompletedHeatsByWorkout', () => {
  it('groups heat numbers per workout and sorts each', async () => {
    mock.queueResult([
      { workoutId: 1, heatNumber: 2 },
      { workoutId: 1, heatNumber: 1 },
      { workoutId: 2, heatNumber: 3 },
    ])
    const result = await getCompletedHeatsByWorkout([1, 2, 3])
    expect(result.get(1)).toEqual([1, 2])
    expect(result.get(2)).toEqual([3])
    expect(result.get(3)).toEqual([])
  })

  it('short-circuits on empty input — no DB call', async () => {
    const result = await getCompletedHeatsByWorkout([])
    expect(result.size).toBe(0)
    expect(mock.calls).toHaveLength(0)
  })
})
