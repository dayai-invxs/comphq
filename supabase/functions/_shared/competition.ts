import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { competition } from '@/db/schema'
import { getRequestContext } from '@/lib/request-context'

type Competition = { id: number; name: string; slug: string }

// v1 used React's cache(), which dedupes within a single render pass. A
// module-level Map is not equivalent — it would outlive the request and serve
// one tenant's competition to the next.
export async function resolveCompetition(slug: string): Promise<Competition | null> {
  if (!slug) return null
  const cache = getRequestContext()?.competitions
  if (cache?.has(slug)) return (cache.get(slug) as Competition | null) ?? null
  let result: Competition | null = null
  try {
    const rows = await db.select().from(competition).where(eq(competition.slug, slug)).limit(1)
    result = rows[0] ?? null
  } catch {
    result = null
  }
  cache?.set(slug, result)
  return result
}

export async function getCompetitionSlug(): Promise<string> {
  try {
    const rows = await db.select({ slug: competition.slug }).from(competition).limit(1)
    return rows[0]?.slug ?? ''
  } catch {
    return ''
  }
}
