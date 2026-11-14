import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { setting, workout } from '@/db/schema'
import { SCORING_SETTING_KEYS, higherWins, placePoints, scoringFromSettings, type Scoring } from '@/lib/pointsScale'

/** A competition's scoring system and points scale, in one read. */
export async function loadScoring(competitionId: number): Promise<Scoring> {
  const rows = await db
    .select({ key: setting.key, value: setting.value })
    .from(setting)
    .where(and(eq(setting.competitionId, competitionId), inArray(setting.key, [...SCORING_SETTING_KEYS])))
  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  return scoringFromSettings((key) => byKey.get(key))
}

/**
 * How heat and knockout seeding count a stored place, lower = better (see
 * calcCumulativePoints). Rank competitions add the place itself; highest-score
 * ones add minus the points it is worth, each workout with its own step.
 */
export async function loadSeedValue(competitionId: number): Promise<((place: number, workoutId: number) => number) | undefined> {
  const scoring = await loadScoring(competitionId)
  if (!higherWins(scoring)) return undefined
  const steps = await db
    .select({ id: workout.id, pointsStep: workout.pointsStep })
    .from(workout)
    .where(eq(workout.competitionId, competitionId))
  const stepOf = new Map(steps.map((w) => [w.id, w.pointsStep]))
  return (place, workoutId) => -placePoints(place, scoring, stepOf.get(workoutId))
}
