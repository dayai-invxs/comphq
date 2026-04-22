import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireSiteAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { CompetitionCreate } from '@/lib/schemas'

/**
 * Public competition list — used by the homepage and any other discovery
 * surface. Returns the minimum fields required to render a link: id, name,
 * slug. No auth required. For the "comps I can admin" list used by the
 * /admin layouts, see /api/competitions/mine.
 */
export async function GET() {
  const { data, error } = await supabase
    .from('Competition')
    .select('id, name, slug')
    .order('id')
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
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
