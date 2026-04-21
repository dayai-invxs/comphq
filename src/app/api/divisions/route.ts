import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember } from '@/lib/auth-competition'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug)

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
  const session = await getServerSession(authOptions)
  const body = await req.json()

  try {
    const { competition } = await requireCompetitionMember(session, body.slug ?? '', 'admin')

    const { name, order } = body as { name: string; order: number | string }
    if (!name?.trim()) return new Response('Name required', { status: 400 })

    const { data, error } = await supabase
      .from('Division')
      .insert({ competitionId: competition.id, name: name.trim(), order: Number(order) })
      .select('*')
      .single()

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
