import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { heatAssignment, score } from '@/db/schema'
import { lowerIsBetter } from '@/lib/scoring'

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
 * How a split team's tiebreak is made. By default the lanes' tiebreaks are
 * added like their scores. With `bestLaneOf` set (the workout's score type),
 * the tiebreak is instead the best single lane's score: "highest individual
 * rep count" breaks the tie, and no lane needs a tiebreak of its own.
 */
export type LaneTotalRule = { bestLaneOf?: string | null }

/**
 * A split team's score: every lane's score added up. Times are entered as each
 * member's total time (cap penalties already in), so they simply add.
 * Null until every lane has a score, so a half-finished team is not ranked on
 * a partial total. Tiebreak and Part B are summed the same way, and left empty
 * if any lane lacks one.
 */
export function sumLaneScores(lanes: LaneScoreRow[], rule: LaneTotalRule = {}): TeamTotal | null {
  if (lanes.length === 0) return null
  const rawScore = sum(lanes.map((l) => l.rawScore))
  if (rawScore == null) return null
  const scores = lanes.map((l) => l.rawScore!)
  return {
    rawScore,
    tiebreakRawScore: rule.bestLaneOf
      ? (lowerIsBetter(rule.bestLaneOf) ? Math.min(...scores) : Math.max(...scores))
      : sum(lanes.map((l) => l.tiebreakRawScore)),
    partBRawScore: sum(lanes.map((l) => l.partBRawScore)),
  }
}

/** The rule a workout's settings give for its split teams. */
export const laneTotalRule = (wk: { scoreType: string; tiebreakBestLane?: boolean | null }): LaneTotalRule =>
  ({ bestLaneOf: wk.tiebreakBestLane ? wk.scoreType : null })

type Writer = Pick<typeof db, 'select' | 'insert' | 'delete'>

/**
 * Writes a split team's Score row from its lanes: the total once every lane
 * has a score, and no row before that, so a half-finished team is not ranked.
 */
export async function writeTeamTotal(q: Writer, workoutId: number, athleteId: number, rule: LaneTotalRule) {
  const all = await q
    .select({ rawScore: heatAssignment.rawScore, tiebreakRawScore: heatAssignment.tiebreakRawScore, partBRawScore: heatAssignment.partBRawScore })
    .from(heatAssignment)
    .where(and(eq(heatAssignment.workoutId, workoutId), eq(heatAssignment.athleteId, athleteId)))
  const total = sumLaneScores(all, rule)
  if (!total) {
    await q.delete(score).where(and(eq(score.athleteId, athleteId), eq(score.workoutId, workoutId)))
    return { total: null, lanesScored: all.filter((l) => l.rawScore != null).length, lanes: all.length }
  }
  const [row] = await q
    .insert(score)
    .values({ athleteId, workoutId, ...total, points: null, partBPoints: null, capped: false, partBCapped: false })
    .onConflictDoUpdate({
      target: [score.athleteId, score.workoutId],
      set: {
        rawScore: sql`excluded."rawScore"`,
        tiebreakRawScore: sql`excluded."tiebreakRawScore"`,
        points: sql`NULL`,
        partBRawScore: sql`excluded."partBRawScore"`,
        partBPoints: sql`NULL`,
        capped: false,
        partBCapped: false,
      },
    })
    .returning()
  return { total: row, lanesScored: all.length, lanes: all.length }
}

/**
 * Rewrites every split team's Score row in a workout, after a setting that
 * changes how lanes add up. Only teams whose lanes carry scores are touched:
 * a team scored as one (a single lane, score typed on the team) is left alone.
 */
export async function rewriteTeamTotals(workoutId: number, rule: LaneTotalRule) {
  const scored = await db
    .select({ athleteId: heatAssignment.athleteId })
    .from(heatAssignment)
    .where(and(eq(heatAssignment.workoutId, workoutId), sql`${heatAssignment.rawScore} IS NOT NULL`))
  for (const athleteId of new Set(scored.map((r) => r.athleteId))) {
    await db.transaction((tx) => writeTeamTotal(tx, workoutId, athleteId, rule))
  }
}

/** Clearing a workout's scores clears lane scores too (split teams, knockout rounds). */
export async function clearLaneScores(workoutId: number) {
  await db
    .update(heatAssignment)
    // A knockout's hand-made advance ticks go with the results they settled.
    .set({ rawScore: null, tiebreakRawScore: null, partBRawScore: null, capped: false, advanced: null })
    .where(eq(heatAssignment.workoutId, workoutId))
}
