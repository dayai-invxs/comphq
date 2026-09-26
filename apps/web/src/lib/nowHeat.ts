import { getCorralMs, getHeatMs, getWalkoutMs, type Heat, type OpsData, type WorkoutData } from './opsHeats'

// Which heat is happening now, and what is queued behind it. v1 answered this
// three times — the public schedule, the ops view and the judge screen each
// filtered and sorted the same payload their own way — and the answers did not
// agree on ordering. One answer here.
//
// A heat leaves the queue when the corral marshal ticks it out, not when it
// finishes: by then the crowd is watching it rather than reading about it.
// That rule is v1's and it is the whole reason `walkout` is consulted here.

export type AthleteChecks = Record<string, { walkout?: boolean } | undefined>

export type PendingHeat = {
  workout: WorkoutData
  heat: Heat
  /** Clock the heat starts on. Null when the workout has no start time. */
  startMs: number | null
  /** Called to the corral, `callTimeSecs` before the start. */
  corralMs: number | null
  /** Walked out, `walkoutTimeSecs` before the start. */
  walkoutMs: number | null
  /** Divisions in the heat, in first-seen lane order. */
  divisions: string[]
}

/**
 * Every heat still to run, earliest first. Only active workouts, and only
 * heats the corral has not walked out.
 *
 * A workout with no start time has no clock to sort by, so it sits after the
 * ones that do rather than at the front — an unscheduled heat is not next.
 */
export function pendingHeats(data: OpsData | undefined, checks: AthleteChecks = {}): PendingHeat[] {
  const rows = (data?.workouts ?? [])
    .filter((w) => w.status === 'active')
    .flatMap((workout) =>
      workout.heats
        .filter((heat) => !checks[`${workout.id}-${heat.heatNumber}`]?.walkout)
        .map((heat) => {
          const startMs = getHeatMs(workout, heat.heatNumber)
          return {
            workout,
            heat,
            startMs,
            corralMs: getCorralMs(workout, startMs),
            walkoutMs: getWalkoutMs(workout, startMs),
            divisions: [...new Set(heat.entries.map((e) => e.divisionName).filter((d): d is string => !!d))],
          }
        }),
    )

  return rows.sort((a, b) => {
    if (a.startMs !== b.startMs) {
      if (a.startMs == null) return 1
      if (b.startMs == null) return -1
      return a.startMs - b.startMs
    }
    return a.workout.number - b.workout.number || a.heat.heatNumber - b.heat.heatNumber
  })
}

/** The heat on the floor: the first one still to run. */
export function currentHeat(data: OpsData | undefined, checks: AthleteChecks = {}): PendingHeat | null {
  return pendingHeats(data, checks)[0] ?? null
}
