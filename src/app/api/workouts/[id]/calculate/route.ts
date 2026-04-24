import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, score, workout } from '@/db/schema'
import { rankAndPersist } from '@/lib/scoring'
import { authErrorResponse, requireCompetitionAdmin, requireWorkoutInCompetition } from '@/lib/auth-competition'

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
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const workoutId = Number(id)
    const wk = await requireWorkoutInCompetition<RankableWorkout>(workoutId, competition.id)

    const scores = await db
      .select({
        athleteId: score.athleteId,
        workoutId: score.workoutId,
        rawScore: score.rawScore,
        tiebreakRawScore: score.tiebreakRawScore,
        partBRawScore: score.partBRawScore,
        divisionId: athlete.divisionId,
      })
      .from(score)
      .innerJoin(athlete, eq(athlete.id, score.athleteId))
      .where(eq(score.workoutId, workoutId))

    const result = await rankAndPersist(workoutId, wk, scores)
    if (result.error) return new Response(result.error, { status: 500 })

    await db.update(workout).set({ status: 'completed' }).where(eq(workout.id, workoutId))

    return Response.json({ message: 'Rankings calculated', count: result.count })
  } catch (e) {
    return authErrorResponse(e)
  }
}
