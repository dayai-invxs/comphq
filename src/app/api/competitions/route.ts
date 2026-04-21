import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase.from('Competition').select('*').order('id')
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { name, slug } = await req.json() as { name: string; slug: string }
  if (!name?.trim() || !slug?.trim()) return new Response('Name and slug required', { status: 400 })

  const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
  const { data, error } = await supabase
    .from('Competition')
    .insert({ name: name.trim(), slug: cleanSlug })
    .select('*')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}
