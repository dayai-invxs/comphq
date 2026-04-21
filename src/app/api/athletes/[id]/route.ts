import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember } from '@/lib/auth-competition'

const ATHLETE_WITH_DIVISION = '*, division:Division(id, name, order)'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')

    const { id } = await params
    const { name, bibNumber, divisionId } = await req.json() as {
      name: string
      bibNumber?: string
      divisionId?: number | null
    }
    if (!name?.trim()) return new Response('Name required', { status: 400 })

    const patch: Record<string, unknown> = {
      name: name.trim(),
      bibNumber: bibNumber?.trim() || null,
    }
    if (divisionId !== undefined) patch.divisionId = divisionId ?? null

    const { data, error } = await supabase
      .from('Athlete')
      .update(patch)
      .eq('id', Number(id))
      .eq('competitionId', competition.id) // cross-tenant defense
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
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')

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
