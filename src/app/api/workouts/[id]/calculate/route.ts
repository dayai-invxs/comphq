import { supabase } from '@/lib/supabase'
import { rankAndPersist } from '@/lib/scoring'
import { authErrorResponse, requireCompetitionAdmin, requireWorkoutInCompetition } from '@/lib/auth-competition'

type RankableWorkout = {
  id: number
  scoreType: string
  tiebreakEnabled: boolean
  partBEnabled: boolean
  partBScoreType: string
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const workoutId = Number(id)
    const workout = await requireWorkoutInCompetition<RankableWorkout>(
      workoutId,
      competition.id,
      'id, scoreType, tiebreakEnabled, partBEnabled, partBScoreType',
    )

    const { data: scores, error: serr } = await supabase
      .from('Score')
      .select('athleteId, workoutId, rawScore, tiebreakRawScore, partBRawScore')
      .eq('workoutId', workoutId)
    if (serr) return new Response(serr.message, { status: 500 })

    const result = await rankAndPersist(workoutId, workout, scores ?? [])
    if (result.error) return new Response(result.error, { status: 500 })

    await supabase.from('Workout').update({ status: 'completed' }).eq('id', workoutId)

    return Response.json({ message: 'Rankings calculated', count: result.count })
  } catch (e) {
    return authErrorResponse(e)
  }
}
