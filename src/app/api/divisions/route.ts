import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveCompetition } from '@/lib/competition'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const { data, error } = await supabase
    .from('Division')
    .select('*')
    .eq('competitionId', competition.id)
    .order('order')
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const competition = await resolveCompetition(body.slug ?? '')
  if (!competition) return new Response('Competition not found', { status: 404 })

  const { name, order } = body as { name: string; order: number | string }
  if (!name?.trim()) return new Response('Name required', { status: 400 })

  const { data, error } = await supabase
    .from('Division')
    .insert({ competitionId: competition.id, name: name.trim(), order: Number(order) })
    .select('*')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}
