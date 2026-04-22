import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
import { rankAndPersist } from '@/lib/scoring'

type WorkoutRow = { id: number; scoreType: string; tiebreakEnabled: boolean; tiebreakScoreType: string; partBEnabled: boolean; partBScoreType: string; status: string }
type ScoreRow = { athleteId: number; workoutId: number; rawScore: number; tiebreakRawScore: number | null; partBRawScore: number | null }

async function getCompetitionAndAthlete(slug: string, id: number) {
  const { competition } = await requireCompetitionAdmin(slug)
  const { data: athlete } = await supabase
    .from('Athlete')
    .select('id, withdrawn')
    .eq('id', id)
    .eq('competitionId', competition.id)
    .maybeSingle()
  if (!athlete) throw new Error('not_found')
  return { competition, athlete: athlete as { id: number; withdrawn: boolean } }
}

// POST — withdraw athlete: flag + insert 0-scores + recalculate completed workouts
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition, athlete } = await getCompetitionAndAthlete(slug, Number((await params).id))
    if (athlete.withdrawn) return Response.json({ withdrawn: true })

    await supabase.from('Athlete').update({ withdrawn: true }).eq('id', athlete.id).eq('competitionId', competition.id)

    const { data: workouts } = await supabase
      .from('Workout')
      .select('id, scoreType, tiebreakEnabled, tiebreakScoreType, partBEnabled, partBScoreType, status')
      .eq('competitionId', competition.id)
      .in('status', ['active', 'completed'])

    if (!workouts || workouts.length === 0) return Response.json({ withdrawn: true })

    const workoutIds = (workouts as WorkoutRow[]).map((w) => w.id)
    const { data: existingScores } = await supabase
      .from('Score').select('workoutId').eq('athleteId', athlete.id).in('workoutId', workoutIds)

    const scoredIds = new Set((existingScores ?? []).map((s) => (s as { workoutId: number }).workoutId))
    const unscoredWorkouts = (workouts as WorkoutRow[]).filter((w) => !scoredIds.has(w.id))

    if (unscoredWorkouts.length > 0) {
      await supabase.from('Score').insert(
        unscoredWorkouts.map((w) => ({
          athleteId: athlete.id, workoutId: w.id,
          rawScore: 0, tiebreakRawScore: null, partBRawScore: null, points: null, partBPoints: null,
        })),
      )

      for (const workout of unscoredWorkouts.filter((w) => w.status === 'completed')) {
        const { data: allScores } = await supabase
          .from('Score')
          .select('athleteId, workoutId, rawScore, tiebreakRawScore, partBRawScore')
          .eq('workoutId', workout.id)
        if (allScores && allScores.length > 0) {
          await rankAndPersist(workout.id, workout, allScores as ScoreRow[])
        }
      }
    }

    return Response.json({ withdrawn: true })
  } catch (e) {
    if (e instanceof Error && e.message === 'not_found') return new Response('Athlete not found', { status: 404 })
    return authErrorResponse(e)
  }
}

// DELETE — un-withdraw: clears the flag only; inserted 0-scores are left in place
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition, athlete } = await getCompetitionAndAthlete(slug, Number((await params).id))
    await supabase.from('Athlete').update({ withdrawn: false }).eq('id', athlete.id).eq('competitionId', competition.id)
    return Response.json({ withdrawn: false })
  } catch (e) {
    if (e instanceof Error && e.message === 'not_found') return new Response('Athlete not found', { status: 404 })
    return authErrorResponse(e)
  }
}
