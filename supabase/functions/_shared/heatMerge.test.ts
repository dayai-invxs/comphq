import { describe, expect, it } from 'vitest'
import { planMerge, type ExistingLane } from './heatMerge'

const at = (id: number, athleteId: number, heatNumber: number, lane: number, round: number | null = null): ExistingLane =>
  ({ id, athleteId, heatNumber, lane, round })

describe('planMerge', () => {
  const existing = [at(1, 10, 1, 1), at(2, 11, 1, 2), at(3, 12, 2, 1), at(4, 13, 2, 2)]

  it('adds a heat and leaves every other lane alone', () => {
    const plan = planMerge(existing, [{ athleteId: 20, heatNumber: 3, lane: 1 }])
    expect(plan).toEqual({ remove: [], insert: [{ athleteId: 20, heatNumber: 3, lane: 1, round: null }], kept: 0, untouched: 4 })
  })

  it('keeps a lane the file confirms, untouched, so its scores survive', () => {
    const plan = planMerge(existing, [{ athleteId: 10, heatNumber: 1, lane: 1 }])
    expect(plan).toMatchObject({ remove: [], insert: [], kept: 1, untouched: 3 })
  })

  it('moves a named athlete, clearing the lane they left', () => {
    const plan = planMerge(existing, [{ athleteId: 10, heatNumber: 3, lane: 4 }])
    expect(plan.remove.map((r) => r.id)).toEqual([1])
    expect(plan.insert).toEqual([{ athleteId: 10, heatNumber: 3, lane: 4, round: null }])
  })

  it('puts someone new in a taken lane, taking the old occupant out of it', () => {
    const plan = planMerge(existing, [{ athleteId: 30, heatNumber: 2, lane: 2 }])
    expect(plan.remove.map((r) => r.id)).toEqual([4])
    expect(plan.insert).toEqual([{ athleteId: 30, heatNumber: 2, lane: 2, round: null }])
  })

  it('places a split team in every lane the file gives it', () => {
    const plan = planMerge(existing, [{ athleteId: 10, heatNumber: 1, lane: 1 }, { athleteId: 10, heatNumber: 2, lane: 3 }])
    expect(plan).toMatchObject({ remove: [], kept: 1, untouched: 3 })
    expect(plan.insert).toEqual([{ athleteId: 10, heatNumber: 2, lane: 3, round: null }])
  })

  it('gives a lane added to a knockout heat that heat\'s round', () => {
    const plan = planMerge([at(1, 10, 5, 1, 2)], [{ athleteId: 20, heatNumber: 5, lane: 2 }])
    expect(plan.insert).toEqual([{ athleteId: 20, heatNumber: 5, lane: 2, round: 2 }])
  })
})
