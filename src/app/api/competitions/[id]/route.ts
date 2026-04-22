import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireSiteAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { CompetitionUpdate } from '@/lib/schemas'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = await parseJson(req, CompetitionUpdate)
  if (!parsed.ok) return parsed.response

  try {
    await requireSiteAdmin()
    const { id } = await params
    const updates: Record<string, string> = {}
    if (parsed.data.name) updates.name = parsed.data.name
    if (parsed.data.slug) {
      const cleanSlug = parsed.data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
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
  try {
    await requireSiteAdmin()
    const { id } = await params
    const { error } = await supabase.from('Competition').delete().eq('id', Number(id))
    if (error) return new Response(error.message, { status: 500 })
    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
