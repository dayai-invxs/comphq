import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { heatAssignment, judgeAssignment, volunteer, volunteerRole, workout, workoutLocation } from '@/db/schema'
import { authErrorResponse, requireSession } from '@/lib/auth-competition'
import { resolveCompetition } from '@/lib/competition'
import { calcHeatStartMs, fmtHeatTime } from '@/lib/heatTime'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    await requireSession()
    const competition = await resolveCompetition(slug)
    if (!competition) return new Response('Competition not found', { status: 404 })

    // Judges for this competition
    const judgeRows = await db
      .select({ id: volunteer.id, name: volunteer.name, roleName: volunteerRole.name })
      .from(volunteer)
      .innerJoin(volunteerRole, eq(volunteerRole.id, volunteer.roleId))
      .where(eq(volunteer.competitionId, competition.id))

    const judges = judgeRows
      .filter(r => r.roleName.toLowerCase() === 'judge')
      .map(r => ({ id: r.id, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const judgeIds = judges.map(j => j.id)

    if (judgeIds.length === 0) return Response.json({ judges: [], workouts: [] })

    // Workouts for this competition
    const workouts = await db
      .select({
        id: workout.id,
        number: workout.number,
        name: workout.name,
        startTime: workout.startTime,
        heatIntervalSecs: workout.heatIntervalSecs,
        timeBetweenHeatsSecs: workout.timeBetweenHeatsSecs,
        heatStartOverrides: workout.heatStartOverrides,
        callTimeSecs: workout.callTimeSecs,
        walkoutTimeSecs: workout.walkoutTimeSecs,
        locationName: workoutLocation.name,
      })
      .from(workout)
      .leftJoin(workoutLocation, eq(workoutLocation.id, workout.locationId))
      .where(eq(workout.competitionId, competition.id))
      .orderBy(asc(workout.number))

    const workoutIds = workouts.map(w => w.id)
    if (workoutIds.length === 0) return Response.json({ judges, workouts: [] })

    // All judge assignments
    const assignments = await db
      .select({
        workoutId: judgeAssignment.workoutId,
        volunteerId: judgeAssignment.volunteerId,
        heatNumber: judgeAssignment.heatNumber,
        lane: judgeAssignment.lane,
      })
      .from(judgeAssignment)
      .where(inArray(judgeAssignment.workoutId, workoutIds))

    // Distinct heat numbers per workout (from athlete assignments)
    const heatRows = await db
      .select({ workoutId: heatAssignment.workoutId, heatNumber: heatAssignment.heatNumber })
      .from(heatAssignment)
      .where(inArray(heatAssignment.workoutId, workoutIds))

    const heatsByWorkout = new Map<number, Set<number>>()
    for (const r of heatRows) {
      if (!heatsByWorkout.has(r.workoutId)) heatsByWorkout.set(r.workoutId, new Set())
      heatsByWorkout.get(r.workoutId)!.add(r.heatNumber)
    }

    const judgeMap = new Map(judges.map(j => [j.id, j.name]))

    const result = workouts.map(wk => {
      const heatNums = [...(heatsByWorkout.get(wk.id) ?? [])].sort((a, b) => a - b)
      const wkAssignments = assignments.filter(a => a.workoutId === wk.id)

      const heats = heatNums.map(heatNumber => {
        const heatMs = calcHeatStartMs(
          heatNumber, wk.startTime, wk.heatIntervalSecs, wk.heatStartOverrides, wk.timeBetweenHeatsSecs,
        )
        return {
          heatNumber,
          heatTime: fmtHeatTime(heatMs),
          assignments: wkAssignments
            .filter(a => a.heatNumber === heatNumber)
            .sort((a, b) => a.lane - b.lane)
            .map(a => ({ judgeId: a.volunteerId, judgeName: judgeMap.get(a.volunteerId) ?? '?', lane: a.lane })),
        }
      })

      return {
        id: wk.id,
        number: wk.number,
        name: wk.name,
        locationName: wk.locationName ?? null,
        heats,
      }
    }).filter(wk => wk.heats.some(h => h.assignments.length > 0))

    return Response.json({ judges, workouts: result })
  } catch (e) {
    return authErrorResponse(e)
  }
}
