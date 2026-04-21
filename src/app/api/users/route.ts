import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { authErrorResponse, requireSiteAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { UserCreate } from '@/lib/schemas'

export async function GET() {
  const session = await getServerSession(authOptions)
  try {
    await requireSiteAdmin(session)
    const { data, error } = await supabase.from('User').select('id, username, role').order('id')
    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data ?? [])
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const parsed = await parseJson(req, UserCreate)
  if (!parsed.ok) return parsed.response

  try {
    await requireSiteAdmin(session)
    const { username, password, role } = parsed.data

    const { data: existing } = await supabase
      .from('User')
      .select('id')
      .eq('username', username)
      .maybeSingle()
    if (existing) return new Response('Username already taken', { status: 409 })

    const hashed = await bcrypt.hash(password, 10)
    const { data, error } = await supabase
      .from('User')
      .insert({ username, password: hashed, role: role ?? 'user' })
      .select('id, username, role')
      .single()

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
