import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, division, heatAssignment, setting, workout } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'
import { calcHeatStartMs } from '@/lib/heatTime'
import { getCompletedHeatsByWorkout } from '@/lib/heatCompletion'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const showBibRows = await db
    .select({ value: setting.value })
    .from(setting)
    .where(and(eq(setting.competitionId, competition.id), eq(setting.key, 'showBib')))
    .limit(1)
  const showBib = showBibRows[0]?.value !== 'false'

  const workouts = await db
    .select({
      id: workout.id,
      number: workout.number,
      name: workout.name,
      startTime: workout.startTime,
      heatIntervalSecs: workout.heatIntervalSecs,
      heatStartOverrides: workout.heatStartOverrides,
      timeBetweenHeatsSecs: workout.timeBetweenHeatsSecs,
      callTimeSecs: workout.callTimeSecs,
      walkoutTimeSecs: workout.walkoutTimeSecs,
    })
    .from(workout)
    .where(and(eq(workout.competitionId, competition.id), eq(workout.status, 'active')))
    .orderBy(asc(workout.number))

  const workoutIds = workouts.map((w) => w.id)

  const [assignments, completedByWorkout] = await Promise.all([
    workoutIds.length > 0
      ? db
          .select({
            workoutId: heatAssignment.workoutId,
            athleteId: heatAssignment.athleteId,
            heatNumber: heatAssignment.heatNumber,
            lane: heatAssignment.lane,
            athleteName: athlete.name,
            bibNumber: athlete.bibNumber,
            divisionName: division.name,
          })
          .from(heatAssignment)
          .innerJoin(athlete, eq(athlete.id, heatAssignment.athleteId))
          .leftJoin(division, eq(division.id, athlete.divisionId))
          .where(inArray(heatAssignment.workoutId, workoutIds))
          .orderBy(asc(heatAssignment.heatNumber), asc(heatAssignment.lane))
      : Promise.resolve([]),
    getCompletedHeatsByWorkout(workoutIds),
  ])

  const result = workouts.map((wk) => {
    const completedHeats = completedByWorkout.get(wk.id) ?? []
    const wAssignments = assignments.filter((a) => a.workoutId === wk.id)

    const schedule = wAssignments
      .filter((a) => !completedHeats.includes(a.heatNumber))
      .map((a) => {
        const heatStartMs = calcHeatStartMs(
          a.heatNumber,
          wk.startTime,
          wk.heatIntervalSecs,
          wk.heatStartOverrides,
          wk.timeBetweenHeatsSecs,
        )
        return {
          athleteId: a.athleteId,
          athleteName: a.athleteName,
          bibNumber: a.bibNumber,
          divisionName: a.divisionName ?? null,
          heatNumber: a.heatNumber,
          lane: a.lane,
          heatTime: heatStartMs != null ? new Date(heatStartMs).toISOString() : null,
          corralTime: heatStartMs != null ? new Date(heatStartMs - wk.callTimeSecs * 1000).toISOString() : null,
          walkoutTime: heatStartMs != null ? new Date(heatStartMs - wk.walkoutTimeSecs * 1000).toISOString() : null,
        }
      })

    return { id: wk.id, number: wk.number, name: wk.name, schedule }
  })

  return Response.json({ workouts: result, showBib }, {
    headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' },
  })
}
