import { supabase } from '@/lib/supabase'
import { rankAndPersist } from '@/lib/scoring'
import { getCompletedHeats } from '@/lib/heatCompletion'
import { authErrorResponse, requireCompetitionMember, requireWorkoutInCompetition } from '@/lib/auth-competition'

type RankableWorkout = {
  id: number
  status: string
  scoreType: string
  tiebreakEnabled: boolean
  partBEnabled: boolean
  partBScoreType: string
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; heatNum: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(slug, 'admin')
    const { id, heatNum } = await params
    const workoutId = Number(id)
    const heatNumber = Number(heatNum)
    const workout = await requireWorkoutInCompetition<RankableWorkout>(
      workoutId,
      competition.id,
      'id, status, scoreType, tiebreakEnabled, partBEnabled, partBScoreType',
    )

    // Idempotent insert: the unique (workoutId, heatNumber) index makes
    // concurrent clicks race-safe. Double-click just no-ops on the second one.
    await supabase
      .from('HeatCompletion')
      .upsert({ workoutId, heatNumber }, { onConflict: 'workoutId,heatNumber', ignoreDuplicates: true })

    const [scoresRes, assignmentsRes, completedHeats] = await Promise.all([
      supabase
        .from('Score')
        .select('athleteId, workoutId, rawScore, tiebreakRawScore, partBRawScore')
        .eq('workoutId', workoutId),
      supabase.from('HeatAssignment').select('heatNumber').eq('workoutId', workoutId),
      getCompletedHeats(workoutId),
    ])

    const scores = scoresRes.data ?? []
    const assignments = assignmentsRes.data ?? []

    const rankResult = await rankAndPersist(workoutId, workout, scores)
    if (rankResult.error) return new Response(rankResult.error, { status: 500 })

    const allHeatNums = Array.from(new Set(assignments.map((a) => (a as { heatNumber: number }).heatNumber)))
    const workoutDone = allHeatNums.length > 0 && allHeatNums.every((n) => completedHeats.includes(n))

    if (workoutDone && workout.status !== 'completed') {
      await supabase.from('Workout').update({ status: 'completed' }).eq('id', workoutId)
    }

    return Response.json({ completedHeats, workoutCompleted: workoutDone })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; heatNum: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(slug, 'admin')
    const { id, heatNum } = await params
    const workoutId = Number(id)
    const heatNumber = Number(heatNum)
    const workout = await requireWorkoutInCompetition<{ status: string }>(
      workoutId,
      competition.id,
      'status',
    )

    await supabase
      .from('HeatCompletion')
      .delete()
      .eq('workoutId', workoutId)
      .eq('heatNumber', heatNumber)

    // Clear points for athletes in the un-completed heat.
    const { data: heatAthletes } = await supabase
      .from('HeatAssignment')
      .select('athleteId')
      .eq('workoutId', workoutId)
      .eq('heatNumber', heatNumber)

    const athleteIds = (heatAthletes ?? []).map((a) => (a as { athleteId: number }).athleteId)
    if (athleteIds.length > 0) {
      await supabase
        .from('Score')
        .update({ points: null })
        .in('athleteId', athleteIds)
        .eq('workoutId', workoutId)
    }

    if (workout.status === 'completed') {
      await supabase.from('Workout').update({ status: 'active' }).eq('id', workoutId)
    }

    const completedHeats = await getCompletedHeats(workoutId)
    return Response.json({ completedHeats })
  } catch (e) {
    return authErrorResponse(e)
  }
}
