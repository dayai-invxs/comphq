import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { authErrorResponse, requireSiteAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { UserUpdate } from '@/lib/schemas'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = await parseJson(req, UserUpdate)
  if (!parsed.ok) return parsed.response

  try {
    await requireSiteAdmin()
    const { id } = await params

    const hashed = await bcrypt.hash(parsed.data.password, 10)
    const { data, error } = await supabase
      .from('User')
      .update({ password: hashed })
      .eq('id', Number(id))
      .select('id, username')
      .single()

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data)
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSiteAdmin()
    const { id } = await params

    // Count site admins — don't let the last one delete themselves.
    const { data: admins, error: cerr } = await supabase
      .from('User')
      .select('id')
      .eq('role', 'admin')
    if (cerr) return new Response(cerr.message, { status: 500 })
    const targetIsAdmin = admins?.some((a) => (a as { id: number }).id === Number(id)) ?? false
    if (targetIsAdmin && (admins?.length ?? 0) <= 1) {
      return new Response('Cannot delete the last site admin', { status: 400 })
    }

    const { error } = await supabase.from('User').delete().eq('id', Number(id))
    if (error) return new Response(error.message, { status: 500 })
    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
