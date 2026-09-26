import { db } from '@/lib/db'
import { competition, competitionAdmin } from '@/db/schema'
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
  try {
    const rows = await db
      .select({ id: competition.id, name: competition.name, slug: competition.slug })
      .from(competition)
      .orderBy(competition.id)
    return Response.json(rows)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return new Response(msg, { status: 500 })
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

    const [created] = await db
      .insert(competition)
      .values({ name, slug: cleanSlug })
      .returning()

    // Creator becomes admin of the competition they just created.
    await db.insert(competitionAdmin).values({
      userId: user.id,
      competitionId: created.id,
    })

    return Response.json(created, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
