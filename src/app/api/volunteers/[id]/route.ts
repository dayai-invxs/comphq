import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { VolunteerUpdate } from '@/lib/schemas'

const VOLUNTEER_WITH_ROLE = '*, role:VolunteerRole(id, name)'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, VolunteerUpdate)
  if (!parsed.ok) return parsed.response
  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const { data, error } = await supabase
      .from('Volunteer')
      .update({ name: parsed.data.name, roleId: parsed.data.roleId ?? null })
      .eq('id', Number(id))
      .eq('competitionId', competition.id)
      .select(VOLUNTEER_WITH_ROLE)
      .maybeSingle()
    if (error) return new Response(error.message, { status: 500 })
    if (!data) return new Response('Not found', { status: 404 })
    return Response.json(data)
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const { error } = await supabase
      .from('Volunteer')
      .delete()
      .eq('id', Number(id))
      .eq('competitionId', competition.id)
    if (error) return new Response(error.message, { status: 500 })
    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
