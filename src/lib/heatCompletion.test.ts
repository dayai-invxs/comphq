import { describe, it, expect } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getCompletedHeats, getCompletedHeatsByWorkout } from './heatCompletion'

describe('getCompletedHeats', () => {
  it('returns sorted heat numbers for a workout', async () => {
    mock.queueResult({ data: [{ heatNumber: 3 }, { heatNumber: 1 }, { heatNumber: 2 }], error: null })
    const result = await getCompletedHeats(7)
    expect(result).toEqual([1, 2, 3])

    const call = mock.lastCall!
    expect(call.table).toBe('HeatCompletion')
    expect(call.ops.find(o => o.op === 'eq')?.args).toEqual(['workoutId', 7])
  })

  it('returns [] when no completions exist', async () => {
    mock.queueResult({ data: [], error: null })
    expect(await getCompletedHeats(99)).toEqual([])
  })
})

describe('getCompletedHeatsByWorkout', () => {
  it('groups heat numbers per workout and sorts each', async () => {
    mock.queueResult({
      data: [
        { workoutId: 1, heatNumber: 2 },
        { workoutId: 1, heatNumber: 1 },
        { workoutId: 2, heatNumber: 3 },
      ],
      error: null,
    })
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
