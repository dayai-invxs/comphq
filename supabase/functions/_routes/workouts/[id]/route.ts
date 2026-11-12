import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete as athleteTable, division as divisionTable, heatAssignment, score, workout } from '@/db/schema'
import { authErrorResponse, requireCompetitionAccess, requireCompetitionAdmin, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { getCompletedHeats } from '@/lib/heatCompletion'
import { laneTotalRule, rewriteTeamTotals } from '@/lib/laneScores'
import { shiftHeatStartOverrides } from '@/lib/heatTime'
import { membersByAthlete } from '@/lib/teamMembers'
import { parseJson } from '@/lib/parseJson'
import { WorkoutUpdate } from '@/lib/schemas'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAccess(slug)
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
          rawScore: heatAssignment.rawScore,
          tiebreakRawScore: heatAssignment.tiebreakRawScore,
          partBRawScore: heatAssignment.partBRawScore,
          teamMemberId: heatAssignment.teamMemberId,
          round: heatAssignment.round,
          capped: heatAssignment.capped,
          advanced: heatAssignment.advanced,
          consolation: heatAssignment.consolation,
          athleteName: athleteTable.name,
          athleteGender: athleteTable.gender,
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
          capped: score.capped,
          partBCapped: score.partBCapped,
          athleteName: athleteTable.name,
          bibNumber: athleteTable.bibNumber,
          divisionId: athleteTable.divisionId,
          divisionName: divisionTable.name,
          divisionOrder: divisionTable.order,
        })
        .from(score)
        .innerJoin(athleteTable, eq(athleteTable.id, score.athleteId))
        .leftJoin(divisionTable, eq(divisionTable.id, athleteTable.divisionId))
        .where(eq(score.workoutId, workoutId)),
      getCompletedHeats(workoutId),
    ])

    // A team's people: printed under its name, and offered per lane when the
    // team is split across heats.
    const members = await membersByAthlete([...new Set(assignments.map((a) => a.athleteId))])

    const assignmentsOut = assignments.map((r) => ({
      id: r.id,
      heatNumber: r.heatNumber,
      lane: r.lane,
      workoutId: r.workoutId,
      athleteId: r.athleteId,
      // A split team's own lane score; null otherwise.
      rawScore: r.rawScore,
      tiebreakRawScore: r.tiebreakRawScore,
      partBRawScore: r.partBRawScore,
      teamMemberId: r.teamMemberId,
      // Knockout: the heat's round, whether the result is capped, and an
      // advance decided by hand (null: by score).
      round: r.round,
      capped: r.capped,
      advanced: r.advanced,
      consolation: r.consolation,
      athlete: {
        id: r.athleteId,
        name: r.athleteName,
        members: (members.get(r.athleteId) ?? []).map((m) => m.name),
        // Gender picks the men's or women's numbers on a printed score card.
        memberList: (members.get(r.athleteId) ?? []).map((m) => ({ id: m.id, name: m.name, gender: m.gender })),
        gender: r.athleteGender,
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
      capped: s.capped,
      partBCapped: s.partBCapped,
      athlete: {
        id: s.athleteId,
        name: s.athleteName,
        bibNumber: s.bibNumber,
        divisionId: s.divisionId,
        // The workout's leaderboard is drawn one division at a time.
        division: s.divisionId != null
          ? { id: s.divisionId, name: s.divisionName ?? '', order: s.divisionOrder ?? 0 }
          : null,
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
    const d = parsed.data
    // Activating, deactivating and completing a workout is running the
    // competition, which a scorekeeper (role 'user') does. Anything else here
    // is the workout's settings, which only an admin changes.
    const settingsChanged = Object.entries(d).some(([key, value]) => key !== 'status' && value !== undefined)
    const { competition } = settingsChanged
      ? await requireCompetitionAdmin(slug)
      : await requireCompetitionAccess(slug)
    const { id } = await params
    const patch: Partial<typeof workout.$inferInsert> = {}

    if (d.name !== undefined) patch.name = d.name
    if (d.description !== undefined) patch.description = d.description ?? null
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
    if (d.doubleWeight !== undefined) patch.doubleWeight = d.doubleWeight
    // Turning one weight on turns the other off, so a patch naming only one
    // never leaves a workout both half and double.
    if (d.halfWeight === true) patch.doubleWeight = false
    if (d.doubleWeight === true) patch.halfWeight = false
    if (d.secret !== undefined) patch.secret = d.secret
    if (d.knockout !== undefined) patch.knockout = d.knockout
    if (d.knockoutRounds !== undefined) patch.knockoutRounds = d.knockoutRounds
    if (d.knockoutAdvance !== undefined) patch.knockoutAdvance = d.knockoutAdvance
    if (d.knockoutDecides !== undefined) patch.knockoutDecides = d.knockoutDecides
    if (d.knockoutConsolation !== undefined) patch.knockoutConsolation = d.knockoutConsolation
    // Only a knockout can decide the competition.
    if (d.knockout === false) patch.knockoutDecides = false
    // A knockout heat has one result per lane; Part B does not apply.
    if (d.knockout === true) patch.partBEnabled = false
    if ('locationId' in d) patch.locationId = d.locationId ?? null
    if (d.scoreCard !== undefined) patch.scoreCard = d.scoreCard

    // Best-lane tiebreak: a split team's tiebreak is its best lane's score, so
    // the tiebreak is on and ranks the way the score does. A knockout has no
    // split teams, and turning the tiebreak off turns this off with it.
    let rewriteTotals = false
    if ([d.tiebreakBestLane, d.tiebreakEnabled, d.scoreType, d.knockout].some((v) => v !== undefined)) {
      const [cur] = await db
        .select({ scoreType: workout.scoreType, knockout: workout.knockout, tiebreakBestLane: workout.tiebreakBestLane })
        .from(workout)
        .where(and(eq(workout.id, Number(id)), eq(workout.competitionId, competition.id)))
      if (cur) {
        const scoreType = d.scoreType ?? cur.scoreType
        const best = !(d.knockout ?? cur.knockout) && d.tiebreakEnabled !== false && (d.tiebreakBestLane ?? cur.tiebreakBestLane)
        patch.tiebreakBestLane = best
        if (best) {
          patch.tiebreakEnabled = true
          patch.tiebreakScoreType = scoreType
        }
        // Team totals already written were made under the old rule.
        rewriteTotals = !(d.knockout ?? cur.knockout) && (best !== cur.tiebreakBestLane || (best && scoreType !== cur.scoreType))
      }
    }

    // Moving the workout's start moves the heats whose own start was edited
    // by the same amount, so they stay where they were relative to it.
    if (d.startTime) {
      const [current] = await db
        .select({ startTime: workout.startTime, heatStartOverrides: workout.heatStartOverrides })
        .from(workout)
        .where(and(eq(workout.id, Number(id)), eq(workout.competitionId, competition.id)))
      const shifted = current && shiftHeatStartOverrides(current.heatStartOverrides, current.startTime, d.startTime)
      if (shifted) patch.heatStartOverrides = shifted
    }

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

    if (rewriteTotals) await rewriteTeamTotals(updated.id, laneTotalRule(updated))

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
