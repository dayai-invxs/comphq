import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAccess } from '@/lib/auth-competition'
import { resolveCompetition } from '@/lib/competition'
import { parseJson } from '@/lib/parseJson'
import { WorkoutEquipmentCreate } from '@/lib/schemas'
import { isUnannounced } from '@/lib/unannounced'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const { id } = await params
  const { data: workout } = await supabase
    .from('Workout').select('id, secret, status').eq('id', Number(id)).eq('competitionId', competition.id).maybeSingle()
  if (!workout) return new Response('Not found', { status: 404 })
  // An unannounced secret workout's equipment would give it away: only the
  // competition's own staff may read it.
  if (isUnannounced(workout)) {
    try {
      await requireCompetitionAccess(slug)
    } catch (e) {
      return authErrorResponse(e)
    }
  }

  const { data, error } = await supabase
    .from('WorkoutEquipment')
    .select('id, item, divisionId, division:Division(id, name)')
    .eq('workoutId', Number(id))
    .order('divisionId', { nullsFirst: true })
    .order('item')
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, WorkoutEquipmentCreate)
  if (!parsed.ok) return parsed.response
  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { id } = await params

    const { data: workout } = await supabase
      .from('Workout').select('id').eq('id', Number(id)).eq('competitionId', competition.id).maybeSingle()
    if (!workout) return new Response('Not found', { status: 404 })

    const { data, error } = await supabase
      .from('WorkoutEquipment')
      .insert({ workoutId: Number(id), item: parsed.data.item, divisionId: parsed.data.divisionId ?? null })
      .select('id, item, divisionId, division:Division(id, name)')
      .single()
    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
