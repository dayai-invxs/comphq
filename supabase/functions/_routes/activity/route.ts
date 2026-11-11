import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, auditLog, workout } from '@/db/schema'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'

// The competition's audit trail, newest first, for its admins: who saved which
// score, completed which heat, changed which setting. The router writes it
// (lib/auditTrail.ts).
//
// The entries hold ids as they were sent; the workouts and athletes come along
// so the page can name them. Something deleted since keeps its id only.

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1000

export async function GET(req: Request) {
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug') ?? ''
  const asked = Number(url.searchParams.get('limit'))
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const [entries, workouts, athletes] = await Promise.all([
      db
        .select({
          id: auditLog.id,
          at: auditLog.createdAt,
          who: auditLog.userName,
          action: auditLog.action,
          resourceId: auditLog.resourceId,
          diff: auditLog.diff,
        })
        .from(auditLog)
        .where(eq(auditLog.competitionId, competition.id))
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(limit),
      db
        .select({ id: workout.id, number: workout.number, name: workout.name, scoreType: workout.scoreType })
        .from(workout)
        .where(eq(workout.competitionId, competition.id)),
      db
        .select({ id: athlete.id, name: athlete.name })
        .from(athlete)
        .where(eq(athlete.competitionId, competition.id)),
    ])
    return Response.json({ entries, workouts, athletes })
  } catch (e) {
    return authErrorResponse(e)
  }
}
