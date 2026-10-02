import type { ScoreTypeValue } from '@/lib/workoutEnums'
import type { Change, Current } from '@/lib/competitionCorner/diff'
import type { ImportPlan, PlanWorkout } from '@/lib/competitionCorner/mapper'

/**
 * Turns the changes the admin accepted into the rows to write, still keyed by
 * source ids. The store resolves those ids to rows as it writes, so this
 * stays pure and testable without a database.
 */

export type Selection = {
  accepted: string[]
  /** Score type the admin picked, by workout change key, where the source had none. */
  scoreTypes: Record<string, ScoreTypeValue>
}

type WorkoutColumns = Omit<PlanWorkout, 'warnings' | 'location' | 'scoreType'> & { scoreType: ScoreTypeValue }

export type Writes = {
  divisions: {
    insert: Array<{ name: string; order: number; externalId: string }>
    update: Array<{ id: number; set: { name?: string; externalId: string } }>
    remove: number[]
  }
  /** Location names the accepted workouts use; created when missing. */
  locations: string[]
  workouts: {
    insert: Array<WorkoutColumns & { callTimeSecs: number; walkoutTimeSecs: number; location: string | null }>
    /** `location` is present only when it changes. */
    update: Array<{ id: number; set: Partial<WorkoutColumns> & { externalId: string }; location?: string | null }>
    remove: number[]
  }
  athletes: {
    insert: Array<{ name: string; externalId: string; divisionExternalId: string | null }>
    /** `divisionExternalId` is present only when the division changes. */
    update: Array<{ id: number; set: { name?: string; externalId: string }; divisionExternalId?: string | null }>
    remove: number[]
  }
  /** Placing lanes clears a workout's start overrides, since they timed the old
      heat sheet; `heatStartOverrides` are the source's for the sheet placed. */
  heats: Array<{
    workoutExternalId: string
    assignments: Array<{ athleteExternalId: string; heatNumber: number; lane: number }>
    heatStartOverrides: Record<string, string>
  }>
}

export type WritesResult = { ok: true; writes: Writes } | { ok: false; errors: string[] }

// Same defaults the add-workout form starts with.
const DEFAULT_CALL_SECS = 600
const DEFAULT_WALKOUT_SECS = 120

const externalIdOf = (key: string) => key.slice(key.indexOf(':') + 1)

function checkSelection(changes: Change[], sel: Selection): string[] {
  const byKey = new Map(changes.map((c) => [c.key, c]))
  const accepted = new Set(sel.accepted)
  const errors: string[] = []
  for (const key of sel.accepted) {
    const change = byKey.get(key)
    if (!change) {
      errors.push(`"${key}" is no longer a change. Preview again.`)
      continue
    }
    for (const req of change.requires) {
      if (!accepted.has(req)) errors.push(`${change.label} needs ${byKey.get(req)?.label ?? req} too.`)
    }
    if (change.needsScoreType && !sel.scoreTypes[key]) errors.push(`Pick a score type for ${change.label}.`)
  }
  return errors
}

function workoutColumns(w: PlanWorkout, scoreType: ScoreTypeValue): WorkoutColumns {
  const { warnings: _w, location: _l, ...columns } = w
  return { ...columns, scoreType }
}

export function planWrites(plan: ImportPlan, current: Current, changes: Change[], sel: Selection): WritesResult {
  const errors = checkSelection(changes, sel)
  if (errors.length) return { ok: false, errors }

  const accepted = new Set(sel.accepted)
  const picked = changes.filter((c) => accepted.has(c.key))
  const of = (entity: Change['entity'], ...kinds: Change['kind'][]) =>
    picked.filter((c) => c.entity === entity && kinds.includes(c.kind))
  const fieldsOf = (c: Change) => new Map(c.fields.map((f) => [f.field, f.after]))

  const divisionByExt = new Map(plan.divisions.map((d) => [d.externalId, d]))
  const workoutByExt = new Map(plan.workouts.map((w) => [w.externalId, w]))
  const athleteByExt = new Map(plan.athletes.map((a) => [a.externalId, a]))

  let order = Math.max(0, ...current.divisions.map((d) => d.order))
  const divisions: Writes['divisions'] = {
    insert: of('division', 'add').map((c) => ({ name: divisionByExt.get(externalIdOf(c.key))!.name, order: ++order, externalId: externalIdOf(c.key) })),
    update: of('division', 'update', 'link').map((c) => {
      const name = fieldsOf(c).get('name') as string | undefined
      return { id: c.id!, set: { ...(name !== undefined && { name }), externalId: externalIdOf(c.key) } }
    }),
    remove: of('division', 'remove').map((c) => c.id!),
  }

  const workouts: Writes['workouts'] = {
    insert: of('workout', 'add').map((c) => {
      const w = workoutByExt.get(externalIdOf(c.key))!
      return {
        ...workoutColumns(w, w.scoreType ?? sel.scoreTypes[c.key]),
        number: c.number ?? w.number,
        callTimeSecs: DEFAULT_CALL_SECS,
        walkoutTimeSecs: DEFAULT_WALKOUT_SECS,
        location: w.location,
      }
    }),
    update: of('workout', 'update', 'link').map((c) => {
      const w = workoutByExt.get(externalIdOf(c.key))!
      const fields = fieldsOf(c)
      const set = Object.fromEntries([...fields].filter(([f]) => f !== 'location'))
      return {
        id: c.id!,
        set: { ...set, externalId: w.externalId, externalPartBId: w.externalPartBId },
        ...(fields.has('location') && { location: fields.get('location') as string | null }),
      }
    }),
    remove: of('workout', 'remove').map((c) => c.id!),
  }

  const locations = [...new Set(
    [...workouts.insert.map((w) => w.location), ...workouts.update.map((w) => w.location)]
      .filter((l): l is string => typeof l === 'string' && l.trim() !== ''),
  )]

  const athletes: Writes['athletes'] = {
    insert: of('athlete', 'add').map((c) => {
      const a = athleteByExt.get(externalIdOf(c.key))!
      return { name: a.name, externalId: a.externalId, divisionExternalId: a.divisionExternalId }
    }),
    update: of('athlete', 'update', 'link').map((c) => {
      const a = athleteByExt.get(externalIdOf(c.key))!
      const fields = fieldsOf(c)
      return {
        id: c.id!,
        set: { ...(fields.has('name') && { name: a.name }), externalId: a.externalId },
        ...(fields.has('division') && { divisionExternalId: a.divisionExternalId }),
      }
    }),
    remove: of('athlete', 'remove').map((c) => c.id!),
  }

  const heats = of('heats', 'add', 'update').map((c) => {
    const workoutExternalId = externalIdOf(c.key)
    return {
      workoutExternalId,
      assignments: plan.heats
        .filter((h) => h.workoutExternalId === workoutExternalId)
        .flatMap((h) => h.lanes.map((l) => ({ athleteExternalId: l.athleteExternalId, heatNumber: h.heatNumber, lane: l.lane }))),
      heatStartOverrides: workoutByExt.get(workoutExternalId)?.heatStartOverrides ?? {},
    }
  })

  return { ok: true, writes: { divisions, locations, workouts, athletes, heats } }
}
