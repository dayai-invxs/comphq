import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, division, heatAssignment } from '@/db/schema'
import { authErrorResponse, requireCompetitionAccess, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { AssignmentReorder } from '@/lib/schemas'
import {
  applyAssignmentUpdates,
  assertValidAssignmentState,
  type AssignmentRef,
} from '@/lib/heat-reorder'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, AssignmentReorder)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id)

    const { updates } = parsed.data

    // Fetch current state, apply proposed updates, validate the end state
    // BEFORE touching the DB. Catches garbage payloads without relying on the
    // deferred unique constraint to abort the transaction.
    const currentRaw = await db
      .select({ id: heatAssignment.id, heatNumber: heatAssignment.heatNumber, lane: heatAssignment.lane })
      .from(heatAssignment)
      .where(eq(heatAssignment.workoutId, workoutId))

    const current = currentRaw as AssignmentRef[]
    const finalState = applyAssignmentUpdates(current, updates)
    try {
      assertValidAssignmentState(finalState)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid reorder'
      return new Response(msg, { status: 400 })
    }

    // Skip the RPC when nothing changes; still return current rows.
    if (updates.length > 0) {
      try {
        await db.execute(
          sql`SELECT reorder_workout_assignments(${workoutId}::int, ${JSON.stringify(updates)}::jsonb)`,
        )
      } catch (e) {
        const err = e as { code?: string; message?: string }
        const msg = err.message ?? 'Reorder failed'
        if (err.code === '23505') return new Response(msg, { status: 409 })
        return new Response(msg, { status: 500 })
      }
    }

    // Return fresh rows with the athlete+division embeds.
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

    const result = rows.map((r) => ({
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

    return Response.json(result)
  } catch (e) {
    return authErrorResponse(e)
  }
}
