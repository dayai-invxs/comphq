import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { heatCompletion } from '@/db/schema'

/**
 * Fetch completed heat numbers for a single workout from the HeatCompletion
 * table. Replaces the old JSON-parse-of-text pattern.
 */
export async function getCompletedHeats(workoutId: number): Promise<number[]> {
  const rows = await db
    .select({ heatNumber: heatCompletion.heatNumber })
    .from(heatCompletion)
    .where(eq(heatCompletion.workoutId, workoutId))
  return rows.map((r) => r.heatNumber).sort((a, b) => a - b)
}

/**
 * Bulk version: returns a Map<workoutId, sorted number[]> for all workoutIds
 * passed in. Used by /api/ops and /api/schedule which fetch many workouts.
 */
export async function getCompletedHeatsByWorkout(
  workoutIds: number[],
): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>()
  for (const id of workoutIds) result.set(id, [])
  if (workoutIds.length === 0) return result

  const rows = await db
    .select({ workoutId: heatCompletion.workoutId, heatNumber: heatCompletion.heatNumber })
    .from(heatCompletion)
    .where(inArray(heatCompletion.workoutId, workoutIds))

  for (const row of rows) {
    const list = result.get(row.workoutId)
    if (list) list.push(row.heatNumber)
  }
  for (const [, arr] of result) arr.sort((a, b) => a - b)
  return result
}
