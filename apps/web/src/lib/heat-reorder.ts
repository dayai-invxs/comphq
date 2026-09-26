export type AssignmentRef = { id: number; heatNumber: number; lane: number }
export type AssignmentUpdate = { id: number; heatNumber: number; lane: number }

// Invariant enforced at DB (DEFERRABLE UNIQUE) and mirrored here:
// lanes per heat must be unique AND contiguous 1..N.
export function assertValidAssignmentState(assignments: AssignmentRef[]): void {
  const byHeat = new Map<number, number[]>()
  for (const a of assignments) {
    const lanes = byHeat.get(a.heatNumber) ?? []
    lanes.push(a.lane)
    byHeat.set(a.heatNumber, lanes)
  }
  for (const [heat, lanes] of byHeat) {
    const sorted = [...lanes].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1]) {
        throw new Error(`Heat ${heat}: duplicate lane ${sorted[i]}`)
      }
    }
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        throw new Error(`Heat ${heat}: lanes not contiguous 1..N (got ${sorted.join(',')})`)
      }
    }
  }
}

// destIndex = target position of the dragged item in the destination heat's
// sorted-by-lane list, 0-based, interpreted as the final index (post-drop).
// For same-heat moves, "same current index" is a no-op.
export function computeAssignmentUpdates(
  assignments: AssignmentRef[],
  dragId: number,
  destHeat: number,
  destIndex: number,
): AssignmentUpdate[] {
  const dragged = assignments.find((a) => a.id === dragId)
  if (!dragged) return []

  const heats = new Map<number, AssignmentRef[]>()
  for (const a of assignments) {
    const list = heats.get(a.heatNumber) ?? []
    list.push(a)
    heats.set(a.heatNumber, list)
  }
  for (const list of heats.values()) list.sort((a, b) => a.lane - b.lane)

  const srcHeat = dragged.heatNumber
  const srcList = heats.get(srcHeat) ?? []
  const currentIndex = srcList.findIndex((a) => a.id === dragId)

  const finalHeats = new Map<number, AssignmentRef[]>()
  for (const [h, list] of heats) finalHeats.set(h, [...list])

  if (srcHeat === destHeat) {
    const withoutDragged = (finalHeats.get(srcHeat) ?? []).filter((a) => a.id !== dragId)
    const clamped = Math.max(0, Math.min(destIndex, withoutDragged.length))
    if (clamped === currentIndex) return []
    withoutDragged.splice(clamped, 0, dragged)
    finalHeats.set(srcHeat, withoutDragged)
  } else {
    finalHeats.set(srcHeat, (finalHeats.get(srcHeat) ?? []).filter((a) => a.id !== dragId))
    const destList = finalHeats.get(destHeat) ?? []
    const clamped = Math.max(0, Math.min(destIndex, destList.length))
    destList.splice(clamped, 0, dragged)
    finalHeats.set(destHeat, destList)
  }

  const updates: AssignmentUpdate[] = []
  for (const [heat, list] of finalHeats) {
    list.forEach((a, idx) => {
      const newLane = idx + 1
      if (a.heatNumber !== heat || a.lane !== newLane) {
        updates.push({ id: a.id, heatNumber: heat, lane: newLane })
      }
    })
  }
  return updates
}

// The UI reports the drop target's index in the currently-rendered list
// (with the dragged row still in place). computeAssignmentUpdates wants the
// index into the dest heat's list *without* the dragged row. For same-heat
// moves where the pointer landed past the dragged row, subtract one so
// "drop just above the row after me" collapses to "stay put" rather than
// registering as a one-slot shift.
export function resolveDestIndex(
  targetHeat: number,
  targetIndex: number,
  srcHeat: number,
  srcIndex: number,
): number {
  if (targetHeat === srcHeat && targetIndex > srcIndex) return targetIndex - 1
  return targetIndex
}

// Heats that will visibly change as a result of a reorder. Source + dest,
// deduped. Used by the hook to mark affected heats as "saving" during an
// in-flight PUT.
export function getAffectedHeats(
  assignments: AssignmentRef[],
  dragId: number,
  destHeat: number,
): number[] {
  const dragged = assignments.find((a) => a.id === dragId)
  if (!dragged) return []
  return dragged.heatNumber === destHeat ? [destHeat] : [dragged.heatNumber, destHeat]
}

export function applyAssignmentUpdates<T extends AssignmentRef>(
  assignments: T[],
  updates: AssignmentUpdate[],
): T[] {
  if (updates.length === 0) return assignments
  const map = new Map(updates.map((u) => [u.id, u]))
  return assignments.map((a) => {
    const u = map.get(a.id)
    return u ? { ...a, heatNumber: u.heatNumber, lane: u.lane } : a
  })
}
