import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { WorkoutEquipmentCreate } from '@/lib/schemas'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params

    // Verify workout belongs to this competition
    const { data: workout } = await supabase
      .from('Workout').select('id').eq('id', Number(id)).eq('competitionId', competition.id).maybeSingle()
    if (!workout) return new Response('Not found', { status: 404 })

    const { data, error } = await supabase
      .from('WorkoutEquipment')
      .select('id, item, divisionId, division:Division(id, name)')
      .eq('workoutId', Number(id))
      .order('divisionId', { nullsFirst: true })
      .order('item')
    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data ?? [])
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, WorkoutEquipmentCreate)
  if (!parsed.ok) return parsed.response
  try {
    const { competition } = await requireCompetitionAdmin(slug)
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
