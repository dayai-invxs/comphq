import { and, asc, eq, inArray, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workout } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'

/**
 * The public workout list: number, name and description of every workout,
 * drafts included. No auth, like the rest of /api/schedule; the admin's
 * /api/workouts is gated and carries every column. A secret workout is the
 * exception: it stays off this list until it goes active, and once revealed it
 * stays on through completed.
 */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  try {
    const rows = await db
      .select({
        id: workout.id,
        number: workout.number,
        name: workout.name,
        description: workout.description,
        status: workout.status,
      })
      .from(workout)
      .where(and(
        eq(workout.competitionId, competition.id),
        or(eq(workout.secret, false), inArray(workout.status, ['active', 'completed'])),
      ))
      .orderBy(asc(workout.number))
    return Response.json(rows)
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Unknown error', { status: 500 })
  }
}
