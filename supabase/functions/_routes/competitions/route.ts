import { and, eq, isNull, ne, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { competition, competitionAdmin, setting } from '@/db/schema'
import { authErrorResponse, requireSiteAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { CompetitionCreate } from '@/lib/schemas'
import { DEFAULT_JUDGE_PASSWORD } from '@/lib/competitionDefaults'

/**
 * Public competition list — used by the homepage and any other discovery
 * surface. Returns the minimum fields required to render a link: id, name,
 * slug. No auth required. For the "comps I can admin" list used by the
 * /admin layouts, see /api/competitions/mine.
 *
 * A competition whose `listed` setting is 'false' is left out. It still opens
 * at its own slug: the public pages resolve a slug through /api/settings, not
 * through this list.
 */
export async function GET() {
  try {
    const rows = await db
      .select({ id: competition.id, name: competition.name, slug: competition.slug })
      .from(competition)
      .leftJoin(setting, and(eq(setting.competitionId, competition.id), eq(setting.key, 'listed')))
      .where(or(isNull(setting.value), ne(setting.value, 'false')))
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
    // Written down rather than left to the fallback, so a later change of
    // the built-in default never changes a running competition's password.
    await db.insert(setting).values({ competitionId: created.id, key: 'judgePassword', value: DEFAULT_JUDGE_PASSWORD })

    return Response.json(created, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
