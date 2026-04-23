import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { competition, competitionAdmin } from '@/db/schema'
import { authErrorResponse, requireSession } from '@/lib/auth-competition'

/**
 * "Competitions I can admin." Super admins see all; regular admins see
 * only the ones they have a CompetitionAdmin row for. Used by the /admin
 * layouts to decide where to route the user (the public list lives at
 * GET /api/competitions).
 */
export async function GET() {
  try {
    const user = await requireSession()
    if (user.isSuper) {
      const rows = await db.select().from(competition).orderBy(competition.id)
      return Response.json(rows)
    }
    const rows = await db
      .select({
        id: competition.id,
        name: competition.name,
        slug: competition.slug,
      })
      .from(competition)
      .innerJoin(competitionAdmin, eq(competitionAdmin.competitionId, competition.id))
      .where(eq(competitionAdmin.userId, user.id))
      .orderBy(competition.id)
    return Response.json(rows)
  } catch (e) {
    return authErrorResponse(e)
  }
}
