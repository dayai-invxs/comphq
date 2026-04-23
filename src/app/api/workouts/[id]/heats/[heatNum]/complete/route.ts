import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { heatAssignment, heatCompletion, score, workout } from '@/db/schema'
import { rankAndPersist } from '@/lib/scoring'
import { getCompletedHeats } from '@/lib/heatCompletion'
import { authErrorResponse, requireCompetitionAdmin, requireWorkoutInCompetition } from '@/lib/auth-competition'

type RankableWorkout = {
  id: number
  status: string
  scoreType: string
  tiebreakEnabled: boolean
  tiebreakScoreType: string
  partBEnabled: boolean
  partBScoreType: string
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; heatNum: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id, heatNum } = await params
    const workoutId = Number(id)
    const heatNumber = Number(heatNum)
    const wk = await requireWorkoutInCompetition<RankableWorkout>(workoutId, competition.id)

    // Idempotent insert: unique (workoutId, heatNumber) makes concurrent clicks
    // race-safe. onConflictDoNothing is the Drizzle equivalent of ignoreDuplicates.
    await db
      .insert(heatCompletion)
      .values({ workoutId, heatNumber })
      .onConflictDoNothing()

    const [scores, assignments, completedHeats] = await Promise.all([
      db
        .select({
          athleteId: score.athleteId,
          workoutId: score.workoutId,
          rawScore: score.rawScore,
          tiebreakRawScore: score.tiebreakRawScore,
          partBRawScore: score.partBRawScore,
        })
        .from(score)
        .where(eq(score.workoutId, workoutId)),
      db
        .select({ heatNumber: heatAssignment.heatNumber })
        .from(heatAssignment)
        .where(eq(heatAssignment.workoutId, workoutId)),
      getCompletedHeats(workoutId),
    ])

    const rankResult = await rankAndPersist(workoutId, wk, scores)
    if (rankResult.error) return new Response(rankResult.error, { status: 500 })

    const allHeatNums = Array.from(new Set(assignments.map((a) => a.heatNumber)))
    const workoutDone = allHeatNums.length > 0 && allHeatNums.every((n) => completedHeats.includes(n))

    if (workoutDone && wk.status !== 'completed') {
      await db.update(workout).set({ status: 'completed' }).where(eq(workout.id, workoutId))
    }

    return Response.json({ completedHeats, workoutCompleted: workoutDone })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; heatNum: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id, heatNum } = await params
    const workoutId = Number(id)
    const heatNumber = Number(heatNum)
    const wk = await requireWorkoutInCompetition<{ status: string }>(workoutId, competition.id)

    await db
      .delete(heatCompletion)
      .where(and(eq(heatCompletion.workoutId, workoutId), eq(heatCompletion.heatNumber, heatNumber)))

    // Clear points for athletes in the un-completed heat.
    const heatAthletes = await db
      .select({ athleteId: heatAssignment.athleteId })
      .from(heatAssignment)
      .where(and(eq(heatAssignment.workoutId, workoutId), eq(heatAssignment.heatNumber, heatNumber)))

    const athleteIds = heatAthletes.map((a) => a.athleteId)
    if (athleteIds.length > 0) {
      await db
        .update(score)
        .set({ points: null })
        .where(and(inArray(score.athleteId, athleteIds), eq(score.workoutId, workoutId)))
    }

    if (wk.status === 'completed') {
      await db.update(workout).set({ status: 'active' }).where(eq(workout.id, workoutId))
    }

    const completedHeats = await getCompletedHeats(workoutId)
    return Response.json({ completedHeats })
  } catch (e) {
    return authErrorResponse(e)
  }
}
