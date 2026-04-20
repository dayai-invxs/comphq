import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

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
    .select('*')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('Division').delete().eq('id', Number(id))
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
