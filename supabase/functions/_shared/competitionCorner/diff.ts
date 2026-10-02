import type { ImportPlan, PlanAthlete, PlanDivision, PlanHeat, PlanWorkout } from './mapper'

/**
 * Compares an import plan with what the competition already holds and lists
 * each difference as a change the admin can accept or skip.
 *
 * Rows match by `externalId` first. A row made by hand (no externalId) with
 * the same name is linked instead of duplicated. Only imported rows are ever
 * offered for removal.
 */

export type CurrentDivision = { id: number; name: string; order: number; externalId: string | null }
export type CurrentAthlete = { id: number; name: string; divisionId: number | null; externalId: string | null }
export type CurrentWorkout = Omit<PlanWorkout, 'scoreType' | 'warnings' | 'externalId'> & {
  id: number
  scoreType: string
  tiebreakScoreType: string
  partBScoreType: string
  externalId: string | null
}
export type CurrentAssignment = { workoutId: number; athleteId: number; heatNumber: number; lane: number }

export type Current = {
  divisions: CurrentDivision[]
  workouts: CurrentWorkout[]
  athletes: CurrentAthlete[]
  heatAssignments: CurrentAssignment[]
}

export type FieldChange = { field: string; before: unknown; after: unknown }

export type Change = {
  /** Stable across preview and apply: "<entity>:<externalId>". */
  key: string
  entity: 'division' | 'workout' | 'athlete' | 'heats'
  kind: 'add' | 'update' | 'link' | 'remove'
  /** The existing row; for heats, the workout. Null when it does not exist yet. */
  id: number | null
  label: string
  fields: FieldChange[]
  warnings: string[]
  /** Keys of add/link changes that must also be accepted for this one to apply. */
  requires: string[]
  /** Number a new workout gets. */
  number?: number
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

const toMs = (iso: string | null) =>
  iso == null ? null : Date.parse(iso.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))

const sameInstant = (a: string | null, b: string | null) => toMs(a) === toMs(b)

function sameOverrides(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((k) => k in b && sameInstant(a[k], b[k]))
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type Match<C> = { row: C; linked: boolean } | null

/**
 * Pairs each plan row with a current row: same externalId, else one unlinked
 * row with the same name. Two or more same-named rows are left alone.
 */
function matchRows<P extends { externalId: string; name: string }, C extends { externalId: string | null; name: string }>(
  planRows: P[], currentRows: C[], onAmbiguous: (p: P, count: number) => void,
): Map<string, Match<C>> {
  const byExternal = new Map(currentRows.filter((c) => c.externalId != null).map((c) => [c.externalId!, c]))
  const unlinked = new Map<string, C[]>()
  for (const c of currentRows) {
    if (c.externalId != null) continue
    unlinked.set(norm(c.name), [...(unlinked.get(norm(c.name)) ?? []), c])
  }
  const taken = new Set<C>()
  const result = new Map<string, Match<C>>()
  for (const p of planRows) {
    const exact = byExternal.get(p.externalId)
    if (exact) {
      result.set(p.externalId, { row: exact, linked: false })
      continue
    }
    const named = (unlinked.get(norm(p.name)) ?? []).filter((c) => !taken.has(c))
    if (named.length === 1) {
      taken.add(named[0])
      result.set(p.externalId, { row: named[0], linked: true })
    } else {
      if (named.length > 1) onAmbiguous(p, named.length)
      result.set(p.externalId, null)
    }
  }
  return result
}

function removals<C extends { id: number; name: string; externalId: string | null }>(
  entity: Change['entity'], currentRows: C[], matched: Map<string, Match<C>>, warnings: string[],
): Change[] {
  const kept = new Set([...matched.values()].map((m) => m?.row))
  return currentRows
    .filter((c) => c.externalId != null && !kept.has(c))
    .map((c) => ({
      key: `${entity}:${c.externalId}`, entity, kind: 'remove' as const, id: c.id, label: c.name,
      fields: [], warnings: [...warnings], requires: [],
    }))
}

function divisionChanges(plan: PlanDivision[], current: CurrentDivision[]) {
  const matched = matchRows(plan, current, () => {})
  const changes: Change[] = []
  for (const d of plan) {
    const m = matched.get(d.externalId)!
    const key = `division:${d.externalId}`
    const fields = m && m.row.name !== d.name ? [{ field: 'name', before: m.row.name, after: d.name }] : []
    if (!m) changes.push({ key, entity: 'division', kind: 'add', id: null, label: d.name, fields, warnings: [], requires: [] })
    else if (m.linked || fields.length) {
      changes.push({ key, entity: 'division', kind: m.linked ? 'link' : 'update', id: m.row.id, label: d.name, fields, warnings: [], requires: [] })
    }
  }
  changes.push(...removals('division', current, matched, ['Its athletes keep their scores but lose the division.']))
  return { changes, matched }
}

function workoutFields(p: PlanWorkout, c: CurrentWorkout): FieldChange[] {
  const fields: FieldChange[] = []
  const diff = (field: keyof CurrentWorkout, after: unknown, same = c[field] === after) => {
    if (!same) fields.push({ field, before: c[field], after })
  }
  diff('name', p.name)
  diff('description', p.description)
  if (p.scoreType) diff('scoreType', p.scoreType)
  diff('tiebreakEnabled', p.tiebreakEnabled)
  if (p.tiebreakEnabled) diff('tiebreakScoreType', p.tiebreakScoreType)
  diff('partBEnabled', p.partBEnabled)
  if (p.partBEnabled) diff('partBScoreType', p.partBScoreType)
  diff('lanes', p.lanes)
  diff('startTime', p.startTime, sameInstant(c.startTime, p.startTime))
  diff('heatIntervalSecs', p.heatIntervalSecs)
  diff('timeBetweenHeatsSecs', p.timeBetweenHeatsSecs)
  diff('heatStartOverrides', p.heatStartOverrides, sameOverrides(c.heatStartOverrides, p.heatStartOverrides))
  diff('location', p.location)
  return fields
}

function workoutChanges(plan: PlanWorkout[], current: CurrentWorkout[]) {
  const matched = matchRows(plan, current, () => {})
  const takenNumbers = new Set(current.map((w) => w.number))
  const changes: Change[] = []
  for (const w of plan) {
    const m = matched.get(w.externalId)!
    const key = `workout:${w.externalId}`
    const warnings = [...w.warnings]
    if (!m) {
      let number = w.number
      while (takenNumbers.has(number)) number++
      takenNumbers.add(number)
      if (number !== w.number) warnings.push(`Number ${w.number} is taken; this becomes workout ${number}.`)
      changes.push({ key, entity: 'workout', kind: 'add', id: null, label: w.name, fields: [], warnings, requires: [], number })
      continue
    }
    const fields = workoutFields(w, m.row)
    if (m.linked || fields.length) {
      changes.push({ key, entity: 'workout', kind: m.linked ? 'link' : 'update', id: m.row.id, label: w.name, fields, warnings, requires: [] })
    }
  }
  changes.push(...removals('workout', current, matched, ['Also deletes its lanes and scores.']))
  return { changes, matched }
}

function athleteChanges(
  plan: PlanAthlete[], current: Current, divisions: ReturnType<typeof divisionChanges>, planDivisions: PlanDivision[],
) {
  const ambiguous = new Map<string, string>()
  const matched = matchRows(plan, current.athletes, (p, n) => {
    ambiguous.set(p.externalId, `${n} athletes here are named "${p.name}"; adding a new one rather than guessing.`)
  })
  const divisionName = new Map(current.divisions.map((d) => [d.id, d.name]))
  const planDivisionName = new Map(planDivisions.map((d) => [d.externalId, d.name]))
  const pendingDivision = new Set(divisions.changes.filter((c) => c.kind === 'add' || c.kind === 'link').map((c) => c.key))

  const changes: Change[] = []
  for (const a of plan) {
    const m = matched.get(a.externalId)!
    const key = `athlete:${a.externalId}`
    const divKey = a.divisionExternalId ? `division:${a.divisionExternalId}` : null
    const requires = divKey && pendingDivision.has(divKey) ? [divKey] : []
    const warnings = ambiguous.has(a.externalId) ? [ambiguous.get(a.externalId)!] : []
    if (!m) {
      changes.push({ key, entity: 'athlete', kind: 'add', id: null, label: a.name, fields: [], warnings, requires })
      continue
    }
    const fields: FieldChange[] = []
    if (m.row.name !== a.name) fields.push({ field: 'name', before: m.row.name, after: a.name })
    const targetDivisionId = a.divisionExternalId ? divisions.matched.get(a.divisionExternalId)?.row.id ?? null : null
    const divisionMoves = a.divisionExternalId != null && (targetDivisionId == null || targetDivisionId !== m.row.divisionId)
    if (divisionMoves) {
      fields.push({
        field: 'division',
        before: m.row.divisionId == null ? null : divisionName.get(m.row.divisionId) ?? null,
        after: planDivisionName.get(a.divisionExternalId!) ?? null,
      })
    }
    if (m.linked || fields.length) {
      changes.push({
        key, entity: 'athlete', kind: m.linked ? 'link' : 'update', id: m.row.id, label: a.name, fields, warnings,
        requires: divisionMoves ? requires : [],
      })
    }
  }
  changes.push(...removals('athlete', current.athletes, matched, ['Also deletes their lanes and scores.']))
  return { changes, matched }
}

function heatChanges(
  plan: ImportPlan, current: Current,
  workouts: ReturnType<typeof workoutChanges>, athletes: ReturnType<typeof athleteChanges>,
): Change[] {
  const externalOf = new Map<number, string>()
  for (const [ext, m] of athletes.matched) if (m) externalOf.set(m.row.id, ext)
  const athleteName = new Map(current.athletes.map((a) => [a.id, a.name]))
  const pending = new Set(
    [...workouts.changes, ...athletes.changes].filter((c) => c.kind === 'add' || c.kind === 'link').map((c) => c.key),
  )

  const byWorkout = new Map<string, PlanHeat[]>()
  for (const h of plan.heats) byWorkout.set(h.workoutExternalId, [...(byWorkout.get(h.workoutExternalId) ?? []), h])

  const changes: Change[] = []
  for (const w of plan.workouts) {
    const heats = byWorkout.get(w.externalId)
    if (!heats?.length) continue
    const workoutId = workouts.matched.get(w.externalId)?.row.id ?? null
    const existing = workoutId == null ? [] : current.heatAssignments.filter((a) => a.workoutId === workoutId)

    const slot = (heat: number, lane: number, who: string) => `${heat}|${lane}|${who}`
    const planSlots = new Set(heats.flatMap((h) => h.lanes.map((l) => slot(h.heatNumber, l.lane, l.athleteExternalId))))
    const currentSlots = new Set(existing.map((a) => slot(a.heatNumber, a.lane, externalOf.get(a.athleteId) ?? `#${a.athleteId}`)))
    if (planSlots.size === currentSlots.size && [...planSlots].every((s) => currentSlots.has(s))) continue

    const handPlaced = existing.filter((a) => !externalOf.has(a.athleteId))
    const warnings = handPlaced.length
      ? [`Replaces ${plural(handPlaced.length, 'lane')} placed by hand (${handPlaced.map((a) => athleteName.get(a.athleteId)).join(', ')}).`]
      : []
    const athleteKeys = new Set(heats.flatMap((h) => h.lanes.map((l) => `athlete:${l.athleteExternalId}`)))
    const requires = [`workout:${w.externalId}`, ...athleteKeys].filter((k) => pending.has(k))

    changes.push({
      key: `heats:${w.externalId}`, entity: 'heats', kind: existing.length ? 'update' : 'add', id: workoutId,
      label: `${w.name} — ${plural(heats.length, 'heat')}, ${plural(planSlots.size, 'lane')}`,
      fields: [], warnings, requires,
    })
  }
  return changes
}

export function diffPlan(plan: ImportPlan, current: Current): Change[] {
  const divisions = divisionChanges(plan.divisions, current.divisions)
  const workouts = workoutChanges(plan.workouts, current.workouts)
  const athletes = athleteChanges(plan.athletes, current, divisions, plan.divisions)
  const heats = heatChanges(plan, current, workouts, athletes)
  return [...divisions.changes, ...workouts.changes, ...athletes.changes, ...heats]
}
