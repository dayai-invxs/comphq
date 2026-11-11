import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, heatAssignment, score } from '@/db/schema'
import { getCompletedHeats } from '@/lib/heatCompletion'
import { rankAndPersist } from '@/lib/scoring'

// Which scores a workout's placings are drawn from while its heats are being
// run, and the re-rank that applies it.
//
// Completing a heat used to rank every score entered so far in the workout,
// so an athlete in a later heat whose score had been typed in early was given
// a placing, and put on a live leaderboard, before their heat had finished.
// Un-completing a heat then cleared only that heat's athletes, which could
// leave people placed with no heat complete at all.

type RankableWorkout = {
  scoreType: string
  tiebreakEnabled: boolean
  tiebreakScoreType: string
  partBEnabled: boolean
  partBScoreType: string
}

/**
 * The athletes whose scores count: those every one of whose heats is
 * complete. A team split across heats is ranked on its summed total, which is
 * only whole once its last heat is done. `null` means everyone, once the
 * whole workout is: that also takes in a score with no heat behind it.
 */
export function rankableAthletes(
  assignments: { athleteId: number; heatNumber: number }[],
  completedHeats: number[],
): Set<number> | null {
  const heats = new Set(assignments.map((a) => a.heatNumber))
  const done = new Set(completedHeats)
  if (heats.size > 0 && [...heats].every((h) => done.has(h))) return null

  const pending = new Set<number>()
  const seen = new Set<number>()
  for (const a of assignments) {
    seen.add(a.athleteId)
    if (!done.has(a.heatNumber)) pending.add(a.athleteId)
  }
  return new Set([...seen].filter((id) => !pending.has(id)))
}

/**
 * Re-ranks a workout from its completed heats: the scores that count get
 * placings among themselves, and any other score loses the placing it had.
 * Returns the completed heats, and whether that is every heat.
 */
export async function rankCompletedHeats(
  workoutId: number,
  wk: RankableWorkout,
): Promise<{ completedHeats: number[]; workoutDone: boolean; error: string | null }> {
  const [scores, assignments, completedHeats] = await Promise.all([
    db
      .select({
        athleteId: score.athleteId,
        workoutId: score.workoutId,
        rawScore: score.rawScore,
        tiebreakRawScore: score.tiebreakRawScore,
        partBRawScore: score.partBRawScore,
        capped: score.capped,
        partBCapped: score.partBCapped,
        points: score.points,
        partBPoints: score.partBPoints,
        divisionId: athlete.divisionId,
      })
      .from(score)
      .innerJoin(athlete, eq(athlete.id, score.athleteId))
      .where(eq(score.workoutId, workoutId)),
    db
      .select({ athleteId: heatAssignment.athleteId, heatNumber: heatAssignment.heatNumber })
      .from(heatAssignment)
      .where(eq(heatAssignment.workoutId, workoutId)),
    getCompletedHeats(workoutId),
  ])

  const counted = rankableAthletes(assignments, completedHeats)
  const workoutDone = counted === null
  const counts = (id: number) => counted === null || counted.has(id)

  const result = await rankAndPersist(workoutId, wk, scores.filter((s) => counts(s.athleteId)))
  if (result.error) return { completedHeats, workoutDone, error: result.error }

  const stale = scores
    .filter((s) => !counts(s.athleteId) && (s.points != null || s.partBPoints != null))
    .map((s) => s.athleteId)
  if (stale.length > 0) {
    await db
      .update(score)
      .set({ points: null, partBPoints: null })
      .where(and(eq(score.workoutId, workoutId), inArray(score.athleteId, stale)))
  }

  return { completedHeats, workoutDone, error: null }
}
