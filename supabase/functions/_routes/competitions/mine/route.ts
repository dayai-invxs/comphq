import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { competition, competitionAdmin } from '@/db/schema'
import { authErrorResponse, requireSession } from '@/lib/auth-competition'

/**
 * "Competitions I'm a member of." Super admins see all (role='admin');
 * competition members see only the ones they have a CompetitionAdmin row for.
 * Returns role so callers can distinguish admin vs user access.
 */
export async function GET() {
  try {
    const user = await requireSession()
    if (user.isSuper) {
      const rows = await db.select({ id: competition.id, name: competition.name, slug: competition.slug }).from(competition).orderBy(competition.id)
      return Response.json(rows.map(r => ({ ...r, role: 'admin' })))
    }
    const rows = await db
      .select({
        id: competition.id,
        name: competition.name,
        slug: competition.slug,
        role: competitionAdmin.role,
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
