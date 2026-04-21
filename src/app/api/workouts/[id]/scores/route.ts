import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { ScoreUpsert } from '@/lib/schemas'

const SCORE_EMBED = '*, athlete:Athlete(id, name, bibNumber, divisionId)'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id, 'id')

    const { data, error } = await supabase
      .from('Score')
      .select(SCORE_EMBED)
      .eq('workoutId', workoutId)
    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data ?? [])
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, ScoreUpsert)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id, 'id')

    const { data, error } = await supabase
      .from('Score')
      .upsert(
        {
          athleteId: parsed.data.athleteId,
          workoutId,
          rawScore: parsed.data.rawScore,
          tiebreakRawScore: parsed.data.tiebreakRawScore ?? null,
          points: null,
          partBRawScore: parsed.data.partBRawScore ?? null,
          partBPoints: null,
        },
        { onConflict: 'athleteId,workoutId' },
      )
      .select('*')
      .single()

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data)
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id, 'id')

    const { data: deleted, error: derr } = await supabase
      .from('Score')
      .delete()
      .eq('workoutId', workoutId)
      .select('id')
    if (derr) return new Response(derr.message, { status: 500 })

    const { error: uerr } = await supabase
      .from('Workout')
      .update({ status: 'active' })
      .eq('id', workoutId)
      .eq('status', 'completed')
    if (uerr) return new Response(uerr.message, { status: 500 })

    return Response.json({ deleted: deleted?.length ?? 0 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
