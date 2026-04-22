import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireSession, requireSiteAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { CompetitionCreate } from '@/lib/schemas'

export async function GET() {
  try {
    const user = await requireSession()
    // Super admins see everything; other users only see comps where they're
    // a CompetitionAdmin.
    if (user.isSuper) {
      const { data, error } = await supabase.from('Competition').select('*').order('id')
      if (error) return new Response(error.message, { status: 500 })
      return Response.json(data ?? [])
    }
    const { data, error } = await supabase
      .from('Competition')
      .select('*, CompetitionAdmin!inner(userId)')
      .eq('CompetitionAdmin.userId', user.id)
      .order('id')
    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data ?? [])
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request) {
  const parsed = await parseJson(req, CompetitionCreate)
  if (!parsed.ok) return parsed.response

  try {
    const user = await requireSiteAdmin()
    const { name, slug } = parsed.data

    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(cleanSlug)) {
      return new Response('Slug must be alphanumeric (dashes allowed internally)', { status: 400 })
    }

    const { data, error } = await supabase
      .from('Competition')
      .insert({ name, slug: cleanSlug })
      .select('*')
      .single()

    if (error) return new Response(error.message, { status: 500 })

    // Creator becomes admin of the competition they just created.
    const created = data as { id: number }
    await supabase.from('CompetitionAdmin').insert({
      userId: user.id,
      competitionId: created.id,
    })

    return Response.json(data, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
