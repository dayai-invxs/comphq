import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { score } from '@/db/schema'

/**
 * Whether the workout has any score. Deleting heats is refused while it does:
 * the scores would outlive the lanes they were entered against.
 */
export async function workoutHasScores(workoutId: number) {
  const rows = await db.select({ id: score.id }).from(score).where(eq(score.workoutId, workoutId)).limit(1)
  return rows.length > 0
}

export const SCORES_BLOCK_MESSAGE = 'This workout has scores. Clear all scores before deleting heats.'
