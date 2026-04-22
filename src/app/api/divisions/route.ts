import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { DivisionCreate } from '@/lib/schemas'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(slug)

    const { data, error } = await supabase
      .from('Division')
      .select('*')
      .eq('competitionId', competition.id)
      .order('order')
    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data ?? [])
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request) {
  const parsed = await parseJson(req, DivisionCreate)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionMember(parsed.data.slug, 'admin')

    const { data, error } = await supabase
      .from('Division')
      .insert({
        competitionId: competition.id,
        name: parsed.data.name,
        order: parsed.data.order,
      })
      .select('*')
      .single()

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
