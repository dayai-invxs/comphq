import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { volunteer, judgeAssignment, workout } from '@/db/schema'
import { authErrorResponse, requireCompetitionAccess } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { z } from 'zod'

const VolunteerSwap = z.object({ newVolunteerId: z.number().int().positive() })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, VolunteerSwap)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { id } = await params
    const oldVolunteerId = Number(id)
    const { newVolunteerId } = parsed.data

    if (oldVolunteerId === newVolunteerId) {
      return new Response('Cannot swap a volunteer with themselves', { status: 400 })
    }

    const [oldVol] = await db
      .select({ id: volunteer.id })
      .from(volunteer)
      .where(and(eq(volunteer.id, oldVolunteerId), eq(volunteer.competitionId, competition.id)))
      .limit(1)
    if (!oldVol) return new Response('Volunteer not found', { status: 404 })

    const [newVol] = await db
      .select({ id: volunteer.id })
      .from(volunteer)
      .where(and(eq(volunteer.id, newVolunteerId), eq(volunteer.competitionId, competition.id)))
      .limit(1)
    if (!newVol) return new Response('Replacement volunteer not found', { status: 404 })

    const oldAssignments = await db
      .select({
        id: judgeAssignment.id,
        workoutId: judgeAssignment.workoutId,
        heatNumber: judgeAssignment.heatNumber,
      })
      .from(judgeAssignment)
      .innerJoin(workout, eq(workout.id, judgeAssignment.workoutId))
      .where(and(
        eq(judgeAssignment.volunteerId, oldVolunteerId),
        eq(workout.competitionId, competition.id),
      ))

    if (oldAssignments.length === 0) {
      return Response.json({ swapped: 0 })
    }

    // Check if new volunteer is already assigned in any of the same (workoutId, heatNumber) slots
    const workoutIds = [...new Set(oldAssignments.map((a) => a.workoutId))]
    const conflicts = await db
      .select({ workoutId: judgeAssignment.workoutId, heatNumber: judgeAssignment.heatNumber })
      .from(judgeAssignment)
      .where(and(
        eq(judgeAssignment.volunteerId, newVolunteerId),
        inArray(judgeAssignment.workoutId, workoutIds),
      ))

    const oldSlots = new Set(oldAssignments.map((a) => `${a.workoutId}:${a.heatNumber}`))
    const conflicting = conflicts.filter((c) => oldSlots.has(`${c.workoutId}:${c.heatNumber}`))

    if (conflicting.length > 0) {
      return Response.json(
        { error: `Replacement volunteer already has assignments in ${conflicting.length} heat(s)` },
        { status: 409 },
      )
    }

    const assignmentIds = oldAssignments.map((a) => a.id)
    await db
      .update(judgeAssignment)
      .set({ volunteerId: newVolunteerId })
      .where(inArray(judgeAssignment.id, assignmentIds))

    return Response.json({ swapped: oldAssignments.length })
  } catch (e) {
    return authErrorResponse(e)
  }
}
