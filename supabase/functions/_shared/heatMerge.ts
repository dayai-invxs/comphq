// "Add / update" for a heat import: the file decides every lane it lists and
// every athlete/team it names; nothing else in the workout changes.
//
// - A lane in the file gets the athlete/team the file puts there. Whoever was
//   in that lane before comes out of it.
// - An athlete/team named in the file ends up exactly where the file puts
//   them: listed once, they move there; listed twice (a split team), they are
//   in both. Lanes they held that the file does not list are cleared.
// - Lanes the file does not mention, held by athletes it does not name, stay.
// A lane that already holds the same athlete/team is left untouched, so its
// scores and picks survive the import.

export type ExistingLane = { id: number; athleteId: number; heatNumber: number; lane: number; round: number | null }
export type IncomingLane = { athleteId: number; heatNumber: number; lane: number }

export type MergePlan = {
  /** Existing rows to delete. */
  remove: ExistingLane[]
  /** Rows to add, with the round of the heat they land in (a knockout's heat keeps its round). */
  insert: Array<IncomingLane & { round: number | null }>
  /** Existing rows the file confirmed as they are. */
  kept: number
  /** Existing rows the file did not touch. */
  untouched: number
}

const slot = (heat: number, lane: number) => `${heat}|${lane}`

export function planMerge(existing: ExistingLane[], incoming: IncomingLane[]): MergePlan {
  const incomingSlots = new Map(incoming.map((r) => [slot(r.heatNumber, r.lane), r.athleteId]))
  const named = new Set(incoming.map((r) => r.athleteId))
  const roundOfHeat = new Map(existing.map((e) => [e.heatNumber, e.round]))

  const remove: ExistingLane[] = []
  const matched = new Set<string>()
  let kept = 0, untouched = 0
  for (const e of existing) {
    const key = slot(e.heatNumber, e.lane)
    const wanted = incomingSlots.get(key)
    if (wanted === e.athleteId) { kept++; matched.add(key); continue }
    if (wanted !== undefined || named.has(e.athleteId)) remove.push(e)
    else untouched++
  }

  const insert = incoming
    .filter((r) => !matched.has(slot(r.heatNumber, r.lane)))
    .map((r) => ({ ...r, round: roundOfHeat.get(r.heatNumber) ?? null }))
  return { remove, insert, kept, untouched }
}
