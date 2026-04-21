import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { calculateRankings } from '@/lib/scoring'
import { authErrorResponse, requireCompetitionMember, requireWorkoutInCompetition } from '@/lib/auth-competition'

type WorkoutForRanking = {
  id: number
  scoreType: string
  tiebreakEnabled: boolean
  partBEnabled: boolean
  partBScoreType: string
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')
    const { id } = await params
    const workoutId = Number(id)
    const workout = await requireWorkoutInCompetition<WorkoutForRanking>(
      workoutId,
      competition.id,
      'id, scoreType, tiebreakEnabled, partBEnabled, partBScoreType',
    )

    const { data: scores, error: serr } = await supabase
      .from('Score')
      .select('*')
      .eq('workoutId', workoutId)
    if (serr) return new Response(serr.message, { status: 500 })

    const rankedA = calculateRankings(
      (scores ?? []).map((s) => ({
        athleteId: (s as { athleteId: number }).athleteId,
        rawScore: (s as { rawScore: number }).rawScore,
        tiebreakRawScore: (s as { tiebreakRawScore: number | null }).tiebreakRawScore,
      })),
      workout.scoreType,
      workout.tiebreakEnabled,
    )

    const partBScores = (scores ?? []).filter((s) => (s as { partBRawScore: number | null }).partBRawScore != null)
    const rankedB = (workout.partBEnabled && partBScores.length > 0)
      ? calculateRankings(
          partBScores.map((s) => ({
            athleteId: (s as { athleteId: number }).athleteId,
            rawScore: (s as { partBRawScore: number }).partBRawScore,
          })),
          workout.partBScoreType,
        )
      : []
    const partBPointsMap = new Map(rankedB.map(({ athleteId, points }) => [athleteId, points]))

    await Promise.all(
      rankedA.map(({ athleteId, points }) =>
        supabase
          .from('Score')
          .update({ points, partBPoints: partBPointsMap.get(athleteId) ?? null })
          .eq('athleteId', athleteId)
          .eq('workoutId', workoutId),
      ),
    )

    await supabase.from('Workout').update({ status: 'completed' }).eq('id', workoutId)

    return Response.json({ message: 'Rankings calculated', count: rankedA.length })
  } catch (e) {
    return authErrorResponse(e)
  }
}
