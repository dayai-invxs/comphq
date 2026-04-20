import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

const SCORE_EMBED = '*, athlete:Athlete(id, name, bibNumber, divisionId)'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabase
    .from('Score')
    .select(SCORE_EMBED)
    .eq('workoutId', Number(id))
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const workoutId = Number(id)
  const { athleteId, rawScore, tiebreakRawScore, partBRawScore } = await req.json() as {
    athleteId: number; rawScore: number; tiebreakRawScore?: number | null; partBRawScore?: number | null
  }

  const { data, error } = await supabase
    .from('Score')
    .upsert(
      {
        athleteId: Number(athleteId),
        workoutId,
        rawScore: Number(rawScore),
        tiebreakRawScore: tiebreakRawScore ?? null,
        points: null,
        partBRawScore: partBRawScore ?? null,
        partBPoints: null,
      },
      { onConflict: 'athleteId,workoutId' },
    )
    .select('*')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const workoutId = Number(id)

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
}
