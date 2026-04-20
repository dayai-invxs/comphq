import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

const ATHLETE_WITH_DIVISION = '*, division:Division(id, name, order)'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

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
    .select(ATHLETE_WITH_DIVISION)
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('Athlete').delete().eq('id', Number(id))
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
