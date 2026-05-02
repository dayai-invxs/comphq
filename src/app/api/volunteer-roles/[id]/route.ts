import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAccess } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { VolunteerRoleUpdate } from '@/lib/schemas'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, VolunteerRoleUpdate)
  if (!parsed.ok) return parsed.response
  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { id } = await params
    const { data, error } = await supabase
      .from('VolunteerRole')
      .update({ name: parsed.data.name })
      .eq('id', Number(id))
      .eq('competitionId', competition.id)
      .select('id, name')
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
    const { competition } = await requireCompetitionAccess(slug)
    const { id } = await params
    const { error } = await supabase
      .from('VolunteerRole')
      .delete()
      .eq('id', Number(id))
      .eq('competitionId', competition.id)
    if (error) return new Response(error.message, { status: 500 })
    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
