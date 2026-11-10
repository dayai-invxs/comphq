import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { memberNamesByAthlete } from '@/lib/teamMembers'
import { athlete, division, heatAssignment, heatCompletion, judgeAssignment, teamMember, workout } from '@/db/schema'
import { assignHeats, calcCumulativePoints } from '@/lib/scoring'
import type { AthleteWithScore } from '@/lib/scoring'
import { score as scoreTable } from '@/db/schema'
import { authErrorResponse, requireCompetitionAccess, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { AssignmentRegen, LaneMemberSet } from '@/lib/schemas'
import { SCORES_BLOCK_MESSAGE, workoutHasScores } from '@/lib/heatDeletion'

// GET /api/workouts/[id]/assignments — returns heat assignments with
// embedded athlete + division. Replaces the PostgREST ASSIGNMENT_EMBED string.
async function fetchAssignmentsWithEmbeds(workoutId: number) {
  const rows = await db
    .select({
      id: heatAssignment.id,
      heatNumber: heatAssignment.heatNumber,
      lane: heatAssignment.lane,
      workoutId: heatAssignment.workoutId,
      athleteId: heatAssignment.athleteId,
      athleteName: athlete.name,
      bibNumber: athlete.bibNumber,
      divisionId: athlete.divisionId,
      divisionName: division.name,
      divisionOrder: division.order,
    })
    .from(heatAssignment)
    .innerJoin(athlete, eq(athlete.id, heatAssignment.athleteId))
    .leftJoin(division, eq(division.id, athlete.divisionId))
    .where(eq(heatAssignment.workoutId, workoutId))
    .orderBy(asc(heatAssignment.heatNumber), asc(heatAssignment.lane))

  // A team shows its members under its name; an individual has none.
  const members = await memberNamesByAthlete(rows.map((r) => r.athleteId))

  // Reshape to match the previous ASSIGNMENT_EMBED response contract.
  return rows.map((r) => ({
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
      members: members.get(r.athleteId) ?? [],
      division: r.divisionId != null
        ? { id: r.divisionId, name: r.divisionName ?? '', order: r.divisionOrder ?? 0 }
        : null,
    },
  }))
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id)

    const data = await fetchAssignmentsWithEmbeds(workoutId)
    return Response.json(data)
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { id } = await params
    const workoutId = Number(id)
    const wk = await requireWorkoutInCompetition<{ id: number; lanes: number; mixedHeats: boolean }>(
      workoutId, competition.id,
    )

    const parsed = await parseJson(req, AssignmentRegen)
    if (!parsed.ok) return parsed.response
    const useCumulative = parsed.data.useCumulative === true

    // Fetch athletes with all their scores embedded — previously a PostgREST
    // `select('*, scores:Score(*)')` call.
    const athleteRows = await db
      .select()
      .from(athlete)
      .where(eq(athlete.competitionId, competition.id))
    const scoreRows = athleteRows.length > 0
      ? await db
          .select()
          .from(scoreTable)
          .where(eq(scoreTable.workoutId, workoutId))
      : []
    // Group scores by athleteId. Note: original supabase embed pulled ALL
    // scores (not filtered by workoutId). Keeping that broader semantic.
    const allScores = await db.select().from(scoreTable)
    const scoresByAthlete = new Map<number, typeof allScores>()
    for (const s of allScores) {
      const arr = scoresByAthlete.get(s.athleteId) ?? []
      arr.push(s)
      scoresByAthlete.set(s.athleteId, arr)
    }
    const athletes: AthleteWithScore[] = athleteRows.map((a) => ({
      ...a,
      scores: (scoresByAthlete.get(a.id) ?? []).map((s) => ({ ...s })),
    })) as unknown as AthleteWithScore[]
    void scoreRows // satisfy linter; workoutId-scoped filter path not used today

    const divisions = await db
      .select({ id: division.id, order: division.order })
      .from(division)
      .where(eq(division.competitionId, competition.id))
    const divisionOrder = new Map(divisions.map((d) => [d.id, d.order]))

    let cumulativePoints: Map<number, number> | undefined
    if (useCumulative) {
      const completed = await db
        .select({ id: workout.id })
        .from(workout)
        .where(sql`${workout.competitionId} = ${competition.id} AND ${workout.status} = 'completed'`)
      cumulativePoints = calcCumulativePoints(athletes, completed.map((w) => w.id))
    }

    const newAssignments = assignHeats(athletes, wk.lanes, {
      cumulativePoints,
      mixedHeats: wk.mixedHeats,
      divisionOrder,
    })

    // Atomic DELETE+INSERT+UPDATE via RPC (defined in migration
    // 20260421160000). Drizzle executes raw SQL for the RPC invocation.
    await db.execute(sql`SELECT replace_workout_heat_assignments(${workoutId}::int, ${JSON.stringify(newAssignments)}::jsonb)`)

    const result = await fetchAssignmentsWithEmbeds(workoutId)
    return Response.json(result, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}

// DELETE /api/workouts/[id]/assignments — clears every heat of the workout,
// with the judges and completions that pointed at them. Refused while the
// workout has scores.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id)

    if (await workoutHasScores(workoutId)) {
      return new Response(SCORES_BLOCK_MESSAGE, { status: 409 })
    }

    await db.transaction(async (tx) => {
      await tx.delete(heatAssignment).where(eq(heatAssignment.workoutId, workoutId))
      await tx.delete(judgeAssignment).where(eq(judgeAssignment.workoutId, workoutId))
      await tx.delete(heatCompletion).where(eq(heatCompletion.workoutId, workoutId))
      await tx.update(workout).set({ heatStartOverrides: {} }).where(eq(workout.id, workoutId))
    })

    return Response.json({ ok: true })
  } catch (e) {
    return authErrorResponse(e)
  }
}

// GET helper kept in sync with the embed shape used by the workout detail UI.
export { fetchAssignmentsWithEmbeds as _fetchAssignmentsWithEmbeds }

// PATCH /api/workouts/[id]/assignments — change one lane: which member of a
// split team runs it (display only), and/or a knockout advance decided by
// hand (true/false; null goes back to deciding by score).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, LaneMemberSet)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id)
    const { assignmentId, teamMemberId, advanced } = parsed.data

    const [lane] = await db
      .select({ athleteId: heatAssignment.athleteId })
      .from(heatAssignment)
      .where(and(eq(heatAssignment.id, assignmentId), eq(heatAssignment.workoutId, workoutId)))
      .limit(1)
    if (!lane) return new Response('Lane not found', { status: 404 })

    if (teamMemberId != null) {
      const [member] = await db
        .select({ id: teamMember.id })
        .from(teamMember)
        .where(and(eq(teamMember.id, teamMemberId), eq(teamMember.athleteId, lane.athleteId)))
        .limit(1)
      if (!member) return new Response('That person is not on this team', { status: 400 })
    }

    await db.update(heatAssignment).set({
      ...(teamMemberId !== undefined && { teamMemberId }),
      ...(advanced !== undefined && { advanced }),
    }).where(eq(heatAssignment.id, assignmentId))
    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
