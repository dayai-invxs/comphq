import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { password } = await req.json() as { password: string }
  if (!password || password.length < 12) return new Response('Password must be at least 12 characters', { status: 400 })

  const hashed = await bcrypt.hash(password, 10)
  const { data, error } = await supabase
    .from('User')
    .update({ password: hashed })
    .eq('id', Number(id))
    .select('id, username')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params

  const { data: all, error: cerr } = await supabase.from('User').select('id')
  if (cerr) return new Response(cerr.message, { status: 500 })
  if (!all || all.length <= 1) return new Response('Cannot delete the last user', { status: 400 })

  const { error } = await supabase.from('User').delete().eq('id', Number(id))
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
