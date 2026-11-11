import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { heatCompletion, workout } from '@/db/schema'
import { getCompletedHeats } from '@/lib/heatCompletion'
import { rankCompletedHeats } from '@/lib/heatRanking'
import { authErrorResponse, requireCompetitionAccess, requireWorkoutInCompetition } from '@/lib/auth-competition'

// Completing or reopening a heat re-ranks the workout from its completed
// heats only (see _shared/heatRanking.ts): a score counts once every heat its
// athlete is in is done, so nobody is placed, or shown on a live leaderboard,
// before their heat has finished.

type RankableWorkout = {
  id: number
  status: string
  scoreType: string
  tiebreakEnabled: boolean
  tiebreakScoreType: string
  partBEnabled: boolean
  partBScoreType: string
  knockout: boolean
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; heatNum: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition } = await requireCompetitionAccess(slug)
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

    // A knockout is ranked once, when the tournament is finished; finishing
    // every heat of a round is not the end of the workout.
    if (wk.knockout) {
      return Response.json({ completedHeats: await getCompletedHeats(workoutId), workoutCompleted: false })
    }

    const { completedHeats, workoutDone, error } = await rankCompletedHeats(workoutId, wk)
    if (error) return new Response(error, { status: 500 })

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
    const { competition } = await requireCompetitionAccess(slug)
    const { id, heatNum } = await params
    const workoutId = Number(id)
    const heatNumber = Number(heatNum)
    const wk = await requireWorkoutInCompetition<RankableWorkout>(workoutId, competition.id)

    await db
      .delete(heatCompletion)
      .where(and(eq(heatCompletion.workoutId, workoutId), eq(heatCompletion.heatNumber, heatNumber)))

    if (wk.status === 'completed') {
      await db.update(workout).set({ status: 'active' }).where(eq(workout.id, workoutId))
    }

    // A knockout's placings come from finishing the tournament, not from its
    // heats; reopening one of its heats leaves its scores as they are.
    if (wk.knockout) return Response.json({ completedHeats: await getCompletedHeats(workoutId) })

    const { completedHeats, error } = await rankCompletedHeats(workoutId, wk)
    if (error) return new Response(error, { status: 500 })
    return Response.json({ completedHeats })
  } catch (e) {
    return authErrorResponse(e)
  }
}
