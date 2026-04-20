import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase.from('Division').select('*').order('order')
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { name, order } = await req.json() as { name: string; order: number | string }
  if (!name?.trim()) return new Response('Name required', { status: 400 })

  const { data, error } = await supabase
    .from('Division')
    .insert({ name: name.trim(), order: Number(order) })
    .select('*')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}
