import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, heatAssignment, heatCompletion, score, workout } from '@/db/schema'
import { rankAndPersist } from '@/lib/scoring'
import { finishTournament, KnockoutRefusal, type KnockoutWorkoutRow } from '@/lib/knockoutStore'
import { authErrorResponse, requireCompetitionAccess, requireWorkoutInCompetition } from '@/lib/auth-competition'

type RankableWorkout = {
  id: number
  scoreType: string
  tiebreakEnabled: boolean
  tiebreakScoreType: string
  partBEnabled: boolean
  partBScoreType: string
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { id } = await params
    const workoutId = Number(id)
    const wk = await requireWorkoutInCompetition<RankableWorkout & { knockout: boolean }>(workoutId, competition.id)

    // A knockout ranks by how far each got, not by one score.
    if (wk.knockout) {
      try {
        const count = await finishTournament(wk as unknown as KnockoutWorkoutRow)
        return Response.json({ message: 'Rankings calculated', count })
      } catch (e) {
        if (e instanceof KnockoutRefusal) return new Response(e.message, { status: 409 })
        throw e
      }
    }

    const scores = await db
      .select({
        athleteId: score.athleteId,
        workoutId: score.workoutId,
        rawScore: score.rawScore,
        tiebreakRawScore: score.tiebreakRawScore,
        partBRawScore: score.partBRawScore,
        capped: score.capped,
        partBCapped: score.partBCapped,
        divisionId: athlete.divisionId,
      })
      .from(score)
      .innerJoin(athlete, eq(athlete.id, score.athleteId))
      .where(eq(score.workoutId, workoutId))

    const result = await rankAndPersist(workoutId, wk, scores)
    if (result.error) return new Response(result.error, { status: 500 })

    // Calculating is the end of the workout: every heat is done, so each one
    // reads as completed and every athlete in it is placed. Already-completed
    // heats are left as they are.
    const lanes = await db
      .select({ heatNumber: heatAssignment.heatNumber })
      .from(heatAssignment)
      .where(eq(heatAssignment.workoutId, workoutId))
    const heatNumbers = [...new Set(lanes.map((l) => l.heatNumber))].sort((a, b) => a - b)
    if (heatNumbers.length > 0) {
      await db
        .insert(heatCompletion)
        .values(heatNumbers.map((heatNumber) => ({ workoutId, heatNumber })))
        .onConflictDoNothing()
    }

    await db.update(workout).set({ status: 'completed' }).where(eq(workout.id, workoutId))

    return Response.json({ message: 'Rankings calculated', count: result.count })
  } catch (e) {
    return authErrorResponse(e)
  }
}
