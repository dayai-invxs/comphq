import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { DivisionUpdate } from '@/lib/schemas'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, DivisionUpdate)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionMember(slug, 'admin')
    const { id } = await params

    const patch: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) patch.name = parsed.data.name
    if (parsed.data.order !== undefined) patch.order = parsed.data.order

    const { data, error } = await supabase
      .from('Division')
      .update(patch)
      .eq('id', Number(id))
      .eq('competitionId', competition.id)
      .select('*')
      .maybeSingle()

    if (error) return new Response(error.message, { status: 500 })
    if (!data) return new Response('Division not found', { status: 404 })
    return Response.json(data)
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(slug, 'admin')
    const { id } = await params
    const { error } = await supabase
      .from('Division')
      .delete()
      .eq('id', Number(id))
      .eq('competitionId', competition.id)
    if (error) return new Response(error.message, { status: 500 })
    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
