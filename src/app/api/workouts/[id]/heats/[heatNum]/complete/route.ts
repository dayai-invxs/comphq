import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { calculateRankings } from '@/lib/scoring'
import { authErrorResponse, requireCompetitionMember, requireWorkoutInCompetition } from '@/lib/auth-competition'

type WorkoutFull = {
  id: number
  status: string
  scoreType: string
  tiebreakEnabled: boolean
  partBEnabled: boolean
  partBScoreType: string
  completedHeats: string
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; heatNum: string }> }) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')
    const { id, heatNum } = await params
    const workoutId = Number(id)
    const heatNumber = Number(heatNum)
    const workout = await requireWorkoutInCompetition<WorkoutFull>(
      workoutId,
      competition.id,
      'id, status, scoreType, tiebreakEnabled, partBEnabled, partBScoreType, completedHeats',
    )

    const completed: number[] = JSON.parse(workout.completedHeats || '[]')
    if (!completed.includes(heatNumber)) completed.push(heatNumber)
    completed.sort((a, b) => a - b)

    const [scoresRes, assignmentsRes] = await Promise.all([
      supabase.from('Score').select('*').eq('workoutId', workoutId),
      supabase.from('HeatAssignment').select('heatNumber').eq('workoutId', workoutId),
    ])

    const scores = scoresRes.data ?? []
    const assignments = assignmentsRes.data ?? []

    const ranked = calculateRankings(
      scores.map((s) => ({
        athleteId: (s as { athleteId: number }).athleteId,
        rawScore: (s as { rawScore: number }).rawScore,
        tiebreakRawScore: (s as { tiebreakRawScore: number | null }).tiebreakRawScore,
      })),
      workout.scoreType,
      workout.tiebreakEnabled,
    )

    const partBScores = scores.filter((s) => (s as { partBRawScore: number | null }).partBRawScore != null)
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
      ranked.map(({ athleteId, points }) =>
        supabase
          .from('Score')
          .update({ points, partBPoints: partBPointsMap.get(athleteId) ?? null })
          .eq('athleteId', athleteId)
          .eq('workoutId', workoutId),
      ),
    )

    const allHeatNums = Array.from(new Set(assignments.map((a) => (a as { heatNumber: number }).heatNumber)))
    const workoutDone = allHeatNums.length > 0 && allHeatNums.every((n) => completed.includes(n))

    await supabase
      .from('Workout')
      .update({
        completedHeats: JSON.stringify(completed),
        status: workoutDone ? 'completed' : workout.status,
      })
      .eq('id', workoutId)

    return Response.json({ completedHeats: completed, workoutCompleted: workoutDone })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; heatNum: string }> }) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')
    const { id, heatNum } = await params
    const workoutId = Number(id)
    const heatNumber = Number(heatNum)
    const workout = await requireWorkoutInCompetition<WorkoutFull>(
      workoutId,
      competition.id,
      'id, status, completedHeats',
    )

    const completed: number[] = JSON.parse(workout.completedHeats || '[]')
    const updated = completed.filter((n) => n !== heatNumber)

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

    await supabase
      .from('Workout')
      .update({
        completedHeats: JSON.stringify(updated),
        status: workout.status === 'completed' ? 'active' : workout.status,
      })
      .eq('id', workoutId)

    return Response.json({ completedHeats: updated })
  } catch (e) {
    return authErrorResponse(e)
  }
}
