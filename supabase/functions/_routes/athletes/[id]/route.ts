import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAccess } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { AthleteUpdate } from '@/lib/schemas'
import { replaceTeamMembers } from '@/lib/teamMembers'
import { ATHLETE_WITH_DIVISION, withSortedMembers } from '@/lib/embeds'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, AthleteUpdate)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAccess(slug)
    const { id } = await params

    const patch: Record<string, unknown> = {
      name: parsed.data.name,
      bibNumber: parsed.data.bibNumber?.trim() || null,
    }
    if (parsed.data.divisionId !== undefined) patch.divisionId = parsed.data.divisionId ?? null
    if (parsed.data.gender !== undefined) patch.gender = parsed.data.gender ?? null

    const { data, error } = await supabase
      .from('Athlete')
      .update(patch)
      .eq('id', Number(id))
      .eq('competitionId', competition.id)
      .select(ATHLETE_WITH_DIVISION)
      .maybeSingle()

    if (error) return new Response(error.message, { status: 500 })
    if (!data) return new Response('Athlete not found', { status: 404 })
    // Members are written only once the athlete is known to be this
    // competition's; a list left out of the body leaves the team's alone.
    if (parsed.data.members !== undefined) {
      return Response.json({ ...data, members: await replaceTeamMembers(data.id, parsed.data.members) })
    }
    return Response.json(withSortedMembers(data))
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
      .from('Athlete')
      .delete()
      .eq('id', Number(id))
      .eq('competitionId', competition.id)
    if (error) return new Response(error.message, { status: 500 })
    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
