import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAccess } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { WorkoutLocationCreate } from '@/lib/schemas'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { data, error } = await supabase
      .from('WorkoutLocation')
      .select('id, name')
      .eq('competitionId', competition.id)
      .order('name')
    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data ?? [])
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request) {
  const parsed = await parseJson(req, WorkoutLocationCreate)
  if (!parsed.ok) return parsed.response
  try {
    const { competition } = await requireCompetitionAccess(parsed.data.slug)
    const { data, error } = await supabase
      .from('WorkoutLocation')
      .insert({ competitionId: competition.id, name: parsed.data.name })
      .select('id, name')
      .single()
    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
