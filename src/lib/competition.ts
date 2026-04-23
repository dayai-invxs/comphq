import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { competition } from '@/db/schema'

type Competition = { id: number; name: string; slug: string }

export const resolveCompetition = cache(async (slug: string): Promise<Competition | null> => {
  if (!slug) return null
  try {
    const rows = await db.select().from(competition).where(eq(competition.slug, slug)).limit(1)
    return rows[0] ?? null
  } catch {
    return null
  }
})

export async function getCompetitionSlug(): Promise<string> {
  try {
    const rows = await db.select({ slug: competition.slug }).from(competition).limit(1)
    return rows[0]?.slug ?? ''
  } catch {
    return ''
  }
}
