import { describe, it, expect } from 'vitest'
import {
  assertValidAssignmentState,
  computeAssignmentUpdates,
  applyAssignmentUpdates,
  getAffectedHeats,
  resolveDestIndex,
  type AssignmentRef,
} from './heat-reorder'

function make(id: number, heat: number, lane: number): AssignmentRef {
  return { id, heatNumber: heat, lane }
}

const HEAT_1_FOUR = [make(1, 1, 1), make(2, 1, 2), make(3, 1, 3), make(4, 1, 4)]
const TWO_HEATS = [
  make(1, 1, 1), make(2, 1, 2), make(3, 1, 3),
  make(4, 2, 1), make(5, 2, 2),
]

describe('computeAssignmentUpdates', () => {
  it('same-heat: lane 3 → index 0 shifts lanes 1 and 2 down', () => {
    // Drag id=3 (lane 3) to index 0 in heat 1. Final: [3,1,2,4].
    const updates = computeAssignmentUpdates(HEAT_1_FOUR, 3, 1, 0)
    // id=3: lane 3 → 1; id=1: lane 1 → 2; id=2: lane 2 → 3; id=4 unchanged.
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 3, heatNumber: 1, lane: 1 },
        { id: 1, heatNumber: 1, lane: 2 },
        { id: 2, heatNumber: 1, lane: 3 },
      ]),
    )
    expect(updates).toHaveLength(3)
  })

  it('same-heat no-op: drop at current index returns []', () => {
    const updates = computeAssignmentUpdates(HEAT_1_FOUR, 2, 1, 1)
    expect(updates).toEqual([])
  })

  it('cross-heat: move heat1/lane2 → heat2 index 0', () => {
    // TWO_HEATS heat1=[1,2,3] heat2=[4,5]. Drag id=2 → heat2 idx 0.
    // Final heat1=[1,3] → id=3 lane 3→2. Final heat2=[2,4,5] → id=2 heat/lane, id=4 lane 1→2, id=5 lane 2→3.
    const updates = computeAssignmentUpdates(TWO_HEATS, 2, 2, 0)
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 3, heatNumber: 1, lane: 2 },
        { id: 2, heatNumber: 2, lane: 1 },
        { id: 4, heatNumber: 2, lane: 2 },
        { id: 5, heatNumber: 2, lane: 3 },
      ]),
    )
    expect(updates).toHaveLength(4)
  })

  it('cross-heat: drop at end appends at lane N+1 of dest', () => {
    // heat2 has 2 items. Drop id=1 at destIndex 2 → heat2=[4,5,1].
    const updates = computeAssignmentUpdates(TWO_HEATS, 1, 2, 2)
    // id=1 lands at heat 2 lane 3. Source heat1=[2,3] → id=2 lane 2→1, id=3 lane 3→2.
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 1, heatNumber: 2, lane: 3 },
        { id: 2, heatNumber: 1, lane: 1 },
        { id: 3, heatNumber: 1, lane: 2 },
      ]),
    )
    expect(updates).toHaveLength(3)
  })

  it('cross-heat into empty heat: single dest update + source renumber', () => {
    const src = [make(1, 1, 1), make(2, 1, 2)]
    // Drag id=2 → heat 5 (empty) index 0.
    const updates = computeAssignmentUpdates(src, 2, 5, 0)
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 2, heatNumber: 5, lane: 1 },
      ]),
    )
    expect(updates).toHaveLength(1)
  })

  it('compacts source heat with gaps', () => {
    // Heat 1 lanes [1, 3, 5] (gaps). Drag id=3 (lane 5) → heat 2 idx 0.
    const src = [make(1, 1, 1), make(2, 1, 3), make(3, 1, 5), make(4, 2, 1)]
    const updates = computeAssignmentUpdates(src, 3, 2, 0)
    // Heat 1 compacts: id=1 stays lane 1, id=2 lane 3→2.
    // Heat 2: id=3 → lane 1, id=4 lane 1→2.
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 2, heatNumber: 1, lane: 2 },
        { id: 3, heatNumber: 2, lane: 1 },
        { id: 4, heatNumber: 2, lane: 2 },
      ]),
    )
    expect(updates).toHaveLength(3)
  })

  it('unknown dragId returns []', () => {
    expect(computeAssignmentUpdates(HEAT_1_FOUR, 999, 1, 0)).toEqual([])
  })

  it('clamps destIndex when out of range', () => {
    // destIndex 99 in a 4-row heat → treated as end.
    const updatesEnd = computeAssignmentUpdates(HEAT_1_FOUR, 1, 1, 99)
    // Final: [2,3,4,1] → id=1 lane 1→4, id=2 lane 2→1, id=3 lane 3→2, id=4 lane 4→3.
    expect(updatesEnd).toEqual(
      expect.arrayContaining([
        { id: 2, heatNumber: 1, lane: 1 },
        { id: 3, heatNumber: 1, lane: 2 },
        { id: 4, heatNumber: 1, lane: 3 },
        { id: 1, heatNumber: 1, lane: 4 },
      ]),
    )
    // destIndex -5 → treated as 0.
    const updatesStart = computeAssignmentUpdates(HEAT_1_FOUR, 4, 1, -5)
    // Final: [4,1,2,3].
    expect(updatesStart).toEqual(
      expect.arrayContaining([
        { id: 4, heatNumber: 1, lane: 1 },
        { id: 1, heatNumber: 1, lane: 2 },
        { id: 2, heatNumber: 1, lane: 3 },
        { id: 3, heatNumber: 1, lane: 4 },
      ]),
    )
  })
})

describe('assertValidAssignmentState', () => {
  it('throws on duplicate (heat, lane)', () => {
    expect(() =>
      assertValidAssignmentState([make(1, 1, 1), make(2, 1, 1)]),
    ).toThrow(/duplicate/i)
  })

  it('throws on non-contiguous lanes within a heat', () => {
    expect(() =>
      assertValidAssignmentState([make(1, 1, 1), make(2, 1, 3)]),
    ).toThrow(/contiguous/i)
  })

  it('returns void silently on valid state', () => {
    expect(() => assertValidAssignmentState(HEAT_1_FOUR)).not.toThrow()
    expect(() => assertValidAssignmentState(TWO_HEATS)).not.toThrow()
    expect(() => assertValidAssignmentState([])).not.toThrow()
  })
})

describe('getAffectedHeats', () => {
  it('same-heat drag returns only that heat', () => {
    // id=2 currently in heat 1, destHeat also 1.
    expect(getAffectedHeats(TWO_HEATS, 2, 1)).toEqual([1])
  })

  it('cross-heat drag returns source and dest, deduped', () => {
    // id=2 in heat 1, destHeat 2.
    const out = getAffectedHeats(TWO_HEATS, 2, 2)
    expect(new Set(out)).toEqual(new Set([1, 2]))
    expect(out).toHaveLength(2)
  })

  it('unknown dragId returns []', () => {
    expect(getAffectedHeats(TWO_HEATS, 999, 2)).toEqual([])
  })
})

describe('resolveDestIndex', () => {
  // Context: drop target indexes reported by the UI reference the rendered
  // list with the dragged row still present. computeAssignmentUpdates wants
  // the final position in the dest heat's without-dragged list. This helper
  // normalizes. Critical for "drop on own slot" to register as a no-op.

  it('same heat, target before dragged → unchanged', () => {
    expect(resolveDestIndex(1, 0, 1, 2)).toBe(0)
    expect(resolveDestIndex(1, 1, 1, 2)).toBe(1)
  })

  it('same heat, target at dragged position → maps to current (no-op)', () => {
    // Dragged at index 2; dropping "above own row" (target.index === 2) must
    // map back to destIndex 2, which computeAssignmentUpdates treats as no-op.
    expect(resolveDestIndex(1, 2, 1, 2)).toBe(2)
  })

  it('same heat, target immediately after dragged → also maps to no-op', () => {
    // Dragged at index 2; dropping "above the row after me" (target.index === 3)
    // is visually "stay put". Subtract 1 so it matches currentIndex.
    expect(resolveDestIndex(1, 3, 1, 2)).toBe(2)
  })

  it('same heat, target further after dragged → shift down by one', () => {
    // Dragged at index 2, heat has 5 rows [A,B,X,D,E]. Drop above E (target.index=4)
    // → final position 3 in withoutDragged [A,B,D,E].
    expect(resolveDestIndex(1, 4, 1, 2)).toBe(3)
  })

  it('cross heat: target.index returned unchanged (dragged not in that list)', () => {
    expect(resolveDestIndex(2, 0, 1, 2)).toBe(0)
    expect(resolveDestIndex(2, 3, 1, 2)).toBe(3)
  })
})

describe('applyAssignmentUpdates', () => {
  it('returns same array reference when updates is empty', () => {
    expect(applyAssignmentUpdates(HEAT_1_FOUR, [])).toBe(HEAT_1_FOUR)
  })

  it('applies heat and lane changes only to affected rows', () => {
    const updates = [
      { id: 2, heatNumber: 2, lane: 1 },
      { id: 4, heatNumber: 1, lane: 2 },
    ]
    const out = applyAssignmentUpdates(HEAT_1_FOUR, updates)
    // Shape preserved — other fields untouched.
    expect(out.find((a) => a.id === 1)).toEqual({ id: 1, heatNumber: 1, lane: 1 })
    expect(out.find((a) => a.id === 2)).toEqual({ id: 2, heatNumber: 2, lane: 1 })
    expect(out.find((a) => a.id === 3)).toEqual({ id: 3, heatNumber: 1, lane: 3 })
    expect(out.find((a) => a.id === 4)).toEqual({ id: 4, heatNumber: 1, lane: 2 })
  })

  it('post-apply state from a computed reorder passes validation', () => {
    const updates = computeAssignmentUpdates(TWO_HEATS, 2, 2, 0)
    const out = applyAssignmentUpdates(TWO_HEATS, updates)
    expect(() => assertValidAssignmentState(out)).not.toThrow()
  })
})
