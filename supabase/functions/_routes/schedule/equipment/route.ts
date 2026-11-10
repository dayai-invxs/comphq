import { asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { division, workout, workoutEquipment } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'
import { isUnannounced } from '@/lib/unannounced'

/**
 * Every workout's equipment in one read, for the equipment crew's screen.
 * That screen asked once per workout before, and each ask paid its own trip
 * (and the browser's own check before it). Public like the rest of
 * /api/schedule; an unannounced secret workout's list is left out, as its
 * equipment would give it away.
 */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  try {
    const workouts = await db
      .select({ id: workout.id, secret: workout.secret, status: workout.status })
      .from(workout)
      .where(eq(workout.competitionId, competition.id))
    const ids = workouts.filter((w) => !isUnannounced(w)).map((w) => w.id)

    const byWorkout: Record<number, Array<{
      id: number; item: string; divisionId: number | null; division: { id: number; name: string } | null
    }>> = {}
    for (const id of ids) byWorkout[id] = []
    if (ids.length === 0) return Response.json({ byWorkout })

    const rows = await db
      .select({
        id: workoutEquipment.id,
        workoutId: workoutEquipment.workoutId,
        item: workoutEquipment.item,
        divisionId: workoutEquipment.divisionId,
        divisionName: division.name,
      })
      .from(workoutEquipment)
      .leftJoin(division, eq(division.id, workoutEquipment.divisionId))
      .where(inArray(workoutEquipment.workoutId, ids))
      // All-division rows first, then by item: the order the one-workout read uses.
      .orderBy(sql`${workoutEquipment.divisionId} asc nulls first`, asc(workoutEquipment.item))

    for (const r of rows) {
      byWorkout[r.workoutId]?.push({
        id: r.id,
        item: r.item,
        divisionId: r.divisionId,
        division: r.divisionId != null && r.divisionName != null ? { id: r.divisionId, name: r.divisionName } : null,
      })
    }
    return Response.json({ byWorkout })
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Unknown error', { status: 500 })
  }
}
