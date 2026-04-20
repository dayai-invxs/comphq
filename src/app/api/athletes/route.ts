import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

const ATHLETE_WITH_DIVISION = '*, division:Division(id, name, order)'

export async function GET() {
  const { data, error } = await supabase
    .from('Athlete')
    .select(ATHLETE_WITH_DIVISION)
    .order('name')

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { name, bibNumber, divisionId } = body as { name: string; bibNumber?: string; divisionId?: number | null }
  if (!name?.trim()) return new Response('Name required', { status: 400 })

  const { data, error } = await supabase
    .from('Athlete')
    .insert({
      name: name.trim(),
      bibNumber: bibNumber?.trim() || null,
      divisionId: divisionId ?? null,
    })
    .select(ATHLETE_WITH_DIVISION)
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { ids } = await req.json() as { ids: number[] }
  if (!Array.isArray(ids) || ids.length === 0) return new Response('No ids provided', { status: 400 })

  const { data, error } = await supabase
    .from('Athlete')
    .delete()
    .in('id', ids)
    .select('id')

  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ deleted: data?.length ?? 0 })
}
