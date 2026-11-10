import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workout } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'
import { isUnannounced, TBA } from '@/lib/unannounced'

/**
 * The public workout list: number, name and description of every workout,
 * drafts included. No auth, like the rest of /api/schedule; the admin's
 * /api/workouts is gated and carries every column. A secret workout is the
 * exception: until it goes active only its number is sent, named "TBA", so
 * the list can say there is a workout still to be announced.
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
        secret: workout.secret,
      })
      .from(workout)
      .where(eq(workout.competitionId, competition.id))
      .orderBy(asc(workout.number))
    return Response.json(rows.map(({ secret, ...w }) => (
      isUnannounced({ secret, status: w.status })
        ? { id: w.id, number: w.number, name: TBA, description: null, status: w.status, tba: true }
        : { ...w, tba: false }
    )))
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Unknown error', { status: 500 })
  }
}
