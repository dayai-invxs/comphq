import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember } from '@/lib/auth-competition'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')

    const { id } = await params
    const { name, order } = await req.json() as { name?: string; order?: number | string }

    const patch: Record<string, unknown> = {}
    if (name?.trim()) patch.name = name.trim()
    if (order != null) patch.order = Number(order)
    if (Object.keys(patch).length === 0) return new Response('Nothing to update', { status: 400 })

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
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')

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
