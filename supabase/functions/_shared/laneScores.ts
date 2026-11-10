import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { heatAssignment } from '@/db/schema'

/** One lane's own score, for a team placed in more than one heat of a workout. */
export type LaneScoreRow = {
  rawScore: number | null
  tiebreakRawScore: number | null
  partBRawScore: number | null
}

export type TeamTotal = { rawScore: number; tiebreakRawScore: number | null; partBRawScore: number | null }

const sum = (xs: Array<number | null>) =>
  xs.every((x) => x != null) ? xs.reduce<number>((a, x) => a + x!, 0) : null

/**
 * A split team's score: every lane's score added up. Times are entered as each
 * member's total time (cap penalties already in), so they simply add.
 * Null until every lane has a score, so a half-finished team is not ranked on
 * a partial total. Tiebreak and Part B are summed the same way, and left empty
 * if any lane lacks one.
 */
export function sumLaneScores(lanes: LaneScoreRow[]): TeamTotal | null {
  if (lanes.length === 0) return null
  const rawScore = sum(lanes.map((l) => l.rawScore))
  if (rawScore == null) return null
  return {
    rawScore,
    tiebreakRawScore: sum(lanes.map((l) => l.tiebreakRawScore)),
    partBRawScore: sum(lanes.map((l) => l.partBRawScore)),
  }
}

/** Clearing a workout's scores clears its split teams' lane scores too. */
export async function clearLaneScores(workoutId: number) {
  await db
    .update(heatAssignment)
    .set({ rawScore: null, tiebreakRawScore: null, partBRawScore: null })
    .where(eq(heatAssignment.workoutId, workoutId))
}
