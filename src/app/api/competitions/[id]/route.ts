import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireSiteAdmin } from '@/lib/auth-competition'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  try {
    await requireSiteAdmin(session)
    const { id } = await params
    const body = await req.json() as { name?: string; slug?: string }
    const updates: Record<string, string> = {}
    if (body.name?.trim()) updates.name = body.name.trim()
    if (body.slug?.trim()) {
      const cleanSlug = body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(cleanSlug)) {
        return new Response('Slug must be alphanumeric (dashes allowed internally)', { status: 400 })
      }
      updates.slug = cleanSlug
    }

    const { data, error } = await supabase
      .from('Competition')
      .update(updates)
      .eq('id', Number(id))
      .select('*')
      .single()

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data)
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  try {
    await requireSiteAdmin(session)
    const { id } = await params
    const { error } = await supabase.from('Competition').delete().eq('id', Number(id))
    if (error) return new Response(error.message, { status: 500 })
    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
