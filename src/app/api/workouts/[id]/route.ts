import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete as athleteTable, division as divisionTable, heatAssignment, score, workout } from '@/db/schema'
import { authErrorResponse, requireCompetitionAdmin, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { getCompletedHeats } from '@/lib/heatCompletion'
import { parseJson } from '@/lib/parseJson'
import { WorkoutUpdate } from '@/lib/schemas'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const workoutId = Number(id)
    const wk = await requireWorkoutInCompetition(workoutId, competition.id)

    const [assignments, scores, completedHeats] = await Promise.all([
      db
        .select({
          id: heatAssignment.id,
          heatNumber: heatAssignment.heatNumber,
          lane: heatAssignment.lane,
          workoutId: heatAssignment.workoutId,
          athleteId: heatAssignment.athleteId,
          athleteName: athleteTable.name,
          bibNumber: athleteTable.bibNumber,
          divisionId: athleteTable.divisionId,
          divisionName: divisionTable.name,
          divisionOrder: divisionTable.order,
        })
        .from(heatAssignment)
        .innerJoin(athleteTable, eq(athleteTable.id, heatAssignment.athleteId))
        .leftJoin(divisionTable, eq(divisionTable.id, athleteTable.divisionId))
        .where(eq(heatAssignment.workoutId, workoutId))
        .orderBy(asc(heatAssignment.heatNumber), asc(heatAssignment.lane)),
      db
        .select({
          id: score.id,
          athleteId: score.athleteId,
          workoutId: score.workoutId,
          rawScore: score.rawScore,
          tiebreakRawScore: score.tiebreakRawScore,
          points: score.points,
          partBRawScore: score.partBRawScore,
          partBPoints: score.partBPoints,
          athleteName: athleteTable.name,
          bibNumber: athleteTable.bibNumber,
          divisionId: athleteTable.divisionId,
        })
        .from(score)
        .innerJoin(athleteTable, eq(athleteTable.id, score.athleteId))
        .where(eq(score.workoutId, workoutId)),
      getCompletedHeats(workoutId),
    ])

    const assignmentsOut = assignments.map((r) => ({
      id: r.id,
      heatNumber: r.heatNumber,
      lane: r.lane,
      workoutId: r.workoutId,
      athleteId: r.athleteId,
      athlete: {
        id: r.athleteId,
        name: r.athleteName,
        bibNumber: r.bibNumber,
        divisionId: r.divisionId,
        division: r.divisionId != null
          ? { id: r.divisionId, name: r.divisionName ?? '', order: r.divisionOrder ?? 0 }
          : null,
      },
    }))

    const scoresOut = scores.map((s) => ({
      id: s.id,
      athleteId: s.athleteId,
      workoutId: s.workoutId,
      rawScore: s.rawScore,
      tiebreakRawScore: s.tiebreakRawScore,
      points: s.points,
      partBRawScore: s.partBRawScore,
      partBPoints: s.partBPoints,
      athlete: {
        id: s.athleteId,
        name: s.athleteName,
        bibNumber: s.bibNumber,
        divisionId: s.divisionId,
      },
    }))

    return Response.json({
      ...wk,
      completedHeats,
      assignments: assignmentsOut,
      scores: scoresOut,
    })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, WorkoutUpdate)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const d = parsed.data
    const patch: Partial<typeof workout.$inferInsert> = {}

    if (d.name !== undefined) patch.name = d.name
    if (d.scoreType !== undefined) patch.scoreType = d.scoreType
    if (d.lanes !== undefined) patch.lanes = d.lanes
    if (d.heatIntervalSecs !== undefined) patch.heatIntervalSecs = d.heatIntervalSecs
    if (d.timeBetweenHeatsSecs !== undefined) patch.timeBetweenHeatsSecs = d.timeBetweenHeatsSecs
    if (d.callTimeSecs !== undefined) patch.callTimeSecs = d.callTimeSecs
    if (d.walkoutTimeSecs !== undefined) patch.walkoutTimeSecs = d.walkoutTimeSecs
    if (d.startTime !== undefined) patch.startTime = d.startTime ?? null
    if (d.status !== undefined) patch.status = d.status
    if (d.mixedHeats !== undefined) patch.mixedHeats = d.mixedHeats
    if (d.tiebreakEnabled !== undefined) patch.tiebreakEnabled = d.tiebreakEnabled
    if (d.tiebreakScoreType !== undefined) patch.tiebreakScoreType = d.tiebreakScoreType
    if (d.partBEnabled !== undefined) patch.partBEnabled = d.partBEnabled
    if (d.partBScoreType !== undefined) patch.partBScoreType = d.partBScoreType
    if (d.number !== undefined) patch.number = d.number
    if (d.halfWeight !== undefined) patch.halfWeight = d.halfWeight
    if ('locationId' in d) patch.locationId = d.locationId ?? null

    const [updated] = await db
      .update(workout)
      .set(patch)
      .where(and(eq(workout.id, Number(id)), eq(workout.competitionId, competition.id)))
      .returning()

    if (!updated) return new Response('Workout not found', { status: 404 })

    // When partBEnabled flips off, null out partB scores (COM-9 #16).
    if (d.partBEnabled === false) {
      await db
        .update(score)
        .set({ partBRawScore: null, partBPoints: null })
        .where(eq(score.workoutId, Number(id)))
    }

    return Response.json(updated)
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    await db
      .delete(workout)
      .where(and(eq(workout.id, Number(id)), eq(workout.competitionId, competition.id)))
    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
