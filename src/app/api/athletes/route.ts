import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember } from '@/lib/auth-competition'

const ATHLETE_WITH_DIVISION = '*, division:Division(id, name, order)'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug)

    const { data, error } = await supabase
      .from('Athlete')
      .select(ATHLETE_WITH_DIVISION)
      .eq('competitionId', competition.id)
      .order('name')

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data ?? [])
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const body = await req.json()

  try {
    const { competition } = await requireCompetitionMember(session, body.slug ?? '', 'admin')

    const { name, bibNumber, divisionId } = body as { name: string; bibNumber?: string; divisionId?: number | null }
    if (!name?.trim()) return new Response('Name required', { status: 400 })

    const { data, error } = await supabase
      .from('Athlete')
      .insert({
        competitionId: competition.id,
        name: name.trim(),
        bibNumber: bibNumber?.trim() || null,
        divisionId: divisionId ?? null,
      })
      .select(ATHLETE_WITH_DIVISION)
      .single()

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  const body = await req.json()

  try {
    const { competition } = await requireCompetitionMember(session, body.slug ?? '', 'admin')

    const { ids } = body as { ids: number[] }
    if (!Array.isArray(ids) || ids.length === 0) return new Response('No ids provided', { status: 400 })

    const { data, error } = await supabase
      .from('Athlete')
      .delete()
      .in('id', ids)
      .eq('competitionId', competition.id)
      .select('id')

    if (error) return new Response(error.message, { status: 500 })
    return Response.json({ deleted: data?.length ?? 0 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
