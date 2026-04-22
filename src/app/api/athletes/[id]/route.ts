import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { AthleteUpdate } from '@/lib/schemas'

const ATHLETE_WITH_DIVISION = '*, division:Division(id, name, order)'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, AthleteUpdate)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params

    const patch: Record<string, unknown> = {
      name: parsed.data.name,
      bibNumber: parsed.data.bibNumber?.trim() || null,
    }
    if (parsed.data.divisionId !== undefined) patch.divisionId = parsed.data.divisionId ?? null

    const { data, error } = await supabase
      .from('Athlete')
      .update(patch)
      .eq('id', Number(id))
      .eq('competitionId', competition.id)
      .select(ATHLETE_WITH_DIVISION)
      .maybeSingle()

    if (error) return new Response(error.message, { status: 500 })
    if (!data) return new Response('Athlete not found', { status: 404 })
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
