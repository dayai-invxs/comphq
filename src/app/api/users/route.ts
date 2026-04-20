import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { data, error } = await supabase.from('User').select('id, username').order('id')
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { username, password } = await req.json() as { username: string; password: string }
  if (!username?.trim()) return new Response('Username required', { status: 400 })
  if (!password || password.length < 6) return new Response('Password must be at least 6 characters', { status: 400 })

  const { data: existing } = await supabase
    .from('User')
    .select('id')
    .eq('username', username.trim())
    .maybeSingle()
  if (existing) return new Response('Username already taken', { status: 409 })

  const hashed = await bcrypt.hash(password, 10)
  const { data, error } = await supabase
    .from('User')
    .insert({ username: username.trim(), password: hashed })
    .select('id, username')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}
