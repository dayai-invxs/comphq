import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete as athleteTable, heatAssignment, score, workout } from '@/db/schema'
import { clearLaneScores, laneTotalRule, writeTeamTotal, type LaneTotalRule } from '@/lib/laneScores'
import { authErrorResponse, requireCompetitionAccess, requireCompetitionAdmin, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { ScoreUpsert, ScorePointsOverride } from '@/lib/schemas'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id)

    const rows = await db
      .select({
        id: score.id,
        athleteId: score.athleteId,
        workoutId: score.workoutId,
        rawScore: score.rawScore,
        tiebreakRawScore: score.tiebreakRawScore,
        points: score.points,
        partBRawScore: score.partBRawScore,
        partBPoints: score.partBPoints,
        capped: score.capped,
        partBCapped: score.partBCapped,
        athleteName: athleteTable.name,
        bibNumber: athleteTable.bibNumber,
        divisionId: athleteTable.divisionId,
      })
      .from(score)
      .innerJoin(athleteTable, eq(athleteTable.id, score.athleteId))
      .where(eq(score.workoutId, workoutId))

    return Response.json(rows.map((r) => ({
      id: r.id,
      athleteId: r.athleteId,
      workoutId: r.workoutId,
      rawScore: r.rawScore,
      tiebreakRawScore: r.tiebreakRawScore,
      points: r.points,
      partBRawScore: r.partBRawScore,
      partBPoints: r.partBPoints,
      capped: r.capped,
      partBCapped: r.partBCapped,
      athlete: { id: r.athleteId, name: r.athleteName, bibNumber: r.bibNumber, divisionId: r.divisionId },
    })))
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, ScoreUpsert)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { id } = await params
    const workoutId = Number(id)
    const wk = await requireWorkoutInCompetition<{ scoreType: string; partBScoreType: string; knockout: boolean; tiebreakBestLane: boolean }>(workoutId, competition.id)

    // The athlete has to be one of this competition's: a score for anyone
    // else's used to be stored all the same.
    const [own] = await db
      .select({ id: athleteTable.id })
      .from(athleteTable)
      .where(and(eq(athleteTable.id, parsed.data.athleteId), eq(athleteTable.competitionId, competition.id)))
      .limit(1)
    if (!own) return new Response('Athlete not found', { status: 404 })

    if (parsed.data.lanes) {
      return await saveLanes(workoutId, parsed.data.athleteId, parsed.data.lanes, {
        knockout: wk.knockout === true,
        canCap: wk.scoreType === 'time',
        rule: laneTotalRule(wk),
      })
    }

    // Only a time can be capped; anything else has no finish to miss.
    const capped = wk.scoreType === 'time' && (parsed.data.capped ?? false)
    const partBCapped = wk.partBScoreType === 'time' && parsed.data.partBRawScore != null && (parsed.data.partBCapped ?? false)

    const [row] = await db
      .insert(score)
      .values({
        athleteId: parsed.data.athleteId,
        workoutId,
        rawScore: parsed.data.rawScore!,
        tiebreakRawScore: parsed.data.tiebreakRawScore ?? null,
        points: null,
        partBRawScore: parsed.data.partBRawScore ?? null,
        partBPoints: null,
        capped,
        partBCapped,
      })
      .onConflictDoUpdate({
        target: [score.athleteId, score.workoutId],
        set: {
          rawScore: sql`excluded."rawScore"`,
          tiebreakRawScore: sql`excluded."tiebreakRawScore"`,
          points: sql`NULL`,
          partBRawScore: sql`excluded."partBRawScore"`,
          partBPoints: sql`NULL`,
          capped: sql`excluded."capped"`,
          partBCapped: sql`excluded."partBCapped"`,
        },
      })
      .returning()

    return Response.json(row)
  } catch (e) {
    return authErrorResponse(e)
  }
}

type LaneInput = {
  assignmentId: number; rawScore: number; capped?: boolean; tiebreakRawScore?: number | null; partBRawScore?: number | null
}

/**
 * Scores kept per lane. Two cases:
 * - A team placed in more than one heat: each member's lane is scored on its
 *   own and the team's Score is the sum, written once every lane has a score.
 * - A knockout workout: each lane is that round's result. Nothing is summed;
 *   the Score row is written when the tournament is finished.
 * Lanes not sent keep what they had, so saving one heat leaves the others.
 */
async function saveLanes(
  workoutId: number, athleteId: number, lanes: LaneInput[], opts: { knockout: boolean; canCap: boolean; rule: LaneTotalRule },
): Promise<Response> {
  try {
    return await writeLanes(workoutId, athleteId, lanes, opts)
  } catch (e) {
    if (e instanceof ForeignLane) return new Response(e.message, { status: 400 })
    throw e
  }
}

class ForeignLane extends Error {}

function writeLanes(
  workoutId: number, athleteId: number, lanes: LaneInput[], opts: { knockout: boolean; canCap: boolean; rule: LaneTotalRule },
): Promise<Response> {
  return db.transaction(async (tx) => {
    for (const l of lanes) {
      const updated = await tx
        .update(heatAssignment)
        .set({
          rawScore: l.rawScore,
          tiebreakRawScore: l.tiebreakRawScore ?? null,
          partBRawScore: opts.knockout ? null : l.partBRawScore ?? null,
          // Only a knockout lane on a timed workout can be capped.
          capped: opts.knockout && opts.canCap && l.capped === true,
        })
        .where(and(
          eq(heatAssignment.id, l.assignmentId),
          eq(heatAssignment.workoutId, workoutId),
          eq(heatAssignment.athleteId, athleteId),
        ))
        .returning({ id: heatAssignment.id })
      // Thrown, so the lanes already written in this call roll back.
      if (updated.length === 0) throw new ForeignLane(`Lane ${l.assignmentId} is not this athlete's in this workout`)
    }

    if (opts.knockout) return Response.json({ athleteId, workoutId, lanes: lanes.length })

    const written = await writeTeamTotal(tx, workoutId, athleteId, opts.rule)
    // Not every member has gone yet: no team score, so no partial ranking.
    if (!written.total) return Response.json({ athleteId, workoutId, pending: true, lanesScored: written.lanesScored, lanes: written.lanes })
    return Response.json(written.total)
  })
}

// Clearing every score in a workout is the admin's: a scorekeeper (role
// 'user') enters and corrects scores one at a time.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id)

    const deleted = await db
      .delete(score)
      .where(eq(score.workoutId, workoutId))
      .returning({ id: score.id })

    await clearLaneScores(workoutId)

    await db
      .update(workout)
      .set({ status: 'active' })
      .where(and(eq(workout.id, workoutId), eq(workout.status, 'completed')))

    return Response.json({ deleted: deleted.length })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = await parseJson(req, ScorePointsOverride)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAccess(parsed.data.slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id)

    await db
      .update(score)
      .set({ points: parsed.data.points })
      .where(and(eq(score.athleteId, parsed.data.athleteId), eq(score.workoutId, workoutId)))

    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}

