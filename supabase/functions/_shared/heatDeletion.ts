import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { heatAssignment, score } from '@/db/schema'

/**
 * Whether the workout has any score. Deleting heats is refused while it does:
 * the scores would outlive the lanes they were entered against.
 */
export async function workoutHasScores(workoutId: number) {
  const rows = await db.select({ id: score.id }).from(score).where(eq(score.workoutId, workoutId)).limit(1)
  if (rows.length > 0) return true
  // A split team's lanes can hold scores before the team has a total.
  const lanes = await db.select({ id: heatAssignment.id }).from(heatAssignment)
    .where(and(eq(heatAssignment.workoutId, workoutId), isNotNull(heatAssignment.rawScore))).limit(1)
  return lanes.length > 0
}

export const SCORES_BLOCK_MESSAGE = 'This workout has scores. Clear all scores before deleting heats.'
