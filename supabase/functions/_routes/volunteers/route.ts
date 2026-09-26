import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAccess } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { VolunteerCreate, VolunteerBulkDelete } from '@/lib/schemas'

const VOLUNTEER_WITH_ROLE = '*, role:VolunteerRole(id, name)'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { data, error } = await supabase
      .from('Volunteer')
      .select(VOLUNTEER_WITH_ROLE)
      .eq('competitionId', competition.id)
      .order('name')
    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data ?? [])
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request) {
  const parsed = await parseJson(req, VolunteerCreate)
  if (!parsed.ok) return parsed.response
  try {
    const { competition } = await requireCompetitionAccess(parsed.data.slug)
    const { data, error } = await supabase
      .from('Volunteer')
      .insert({
        competitionId: competition.id,
        name: parsed.data.name,
        roleId: parsed.data.roleId ?? null,
      })
      .select(VOLUNTEER_WITH_ROLE)
      .single()
    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request) {
  const parsed = await parseJson(req, VolunteerBulkDelete)
  if (!parsed.ok) return parsed.response
  try {
    const { competition } = await requireCompetitionAccess(parsed.data.slug)
    const { data, error } = await supabase
      .from('Volunteer')
      .delete()
      .in('id', parsed.data.ids)
      .eq('competitionId', competition.id)
      .select('id')
    if (error) return new Response(error.message, { status: 500 })
    return Response.json({ deleted: data?.length ?? 0 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
