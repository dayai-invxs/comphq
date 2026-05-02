import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, heatAssignment, workout } from '@/db/schema'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { AthleteSwap } from '@/lib/schemas'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, AthleteSwap)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const oldAthleteId = Number(id)
    const { newAthleteId } = parsed.data

    if (oldAthleteId === newAthleteId) {
      return new Response('Cannot swap an athlete with themselves', { status: 400 })
    }

    const [oldAthlete] = await db
      .select({ id: athlete.id })
      .from(athlete)
      .where(and(eq(athlete.id, oldAthleteId), eq(athlete.competitionId, competition.id)))
      .limit(1)
    if (!oldAthlete) return new Response('Athlete not found', { status: 404 })

    const [newAthlete] = await db
      .select({ id: athlete.id })
      .from(athlete)
      .where(and(eq(athlete.id, newAthleteId), eq(athlete.competitionId, competition.id)))
      .limit(1)
    if (!newAthlete) return new Response('Replacement athlete not found', { status: 404 })

    const oldAssignments = await db
      .select({ id: heatAssignment.id, workoutId: heatAssignment.workoutId })
      .from(heatAssignment)
      .innerJoin(workout, eq(workout.id, heatAssignment.workoutId))
      .where(and(
        eq(heatAssignment.athleteId, oldAthleteId),
        eq(workout.competitionId, competition.id),
      ))

    if (oldAssignments.length === 0) {
      return Response.json({ swapped: 0 })
    }

    const workoutIds = oldAssignments.map((a) => a.workoutId)
    const conflicts = await db
      .select({ workoutId: heatAssignment.workoutId })
      .from(heatAssignment)
      .where(and(
        eq(heatAssignment.athleteId, newAthleteId),
        inArray(heatAssignment.workoutId, workoutIds),
      ))

    if (conflicts.length > 0) {
      return Response.json(
        { error: `Replacement athlete already has heat assignments in ${conflicts.length} workout(s)` },
        { status: 409 },
      )
    }

    const assignmentIds = oldAssignments.map((a) => a.id)
    await db
      .update(heatAssignment)
      .set({ athleteId: newAthleteId })
      .where(inArray(heatAssignment.id, assignmentIds))

    return Response.json({ swapped: oldAssignments.length })
  } catch (e) {
    return authErrorResponse(e)
  }
}
