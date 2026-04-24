import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { heatAssignment, heatCompletion, judgeAssignment, volunteer, volunteerRole, workout, workoutLocation } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'
import { calcHeatStartMs } from '@/lib/heatTime'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const competition = await resolveCompetition(slug)
    if (!competition) return new Response('Competition not found', { status: 404 })

    // All volunteers for name lookup in assignments
    const allVolunteerRows = await db
      .select({ id: volunteer.id, name: volunteer.name })
      .from(volunteer)
      .where(eq(volunteer.competitionId, competition.id))

    // Judge-role volunteers for the header count
    const judgeRoleRows = await db
      .select({ id: volunteer.id, name: volunteer.name, roleName: volunteerRole.name })
      .from(volunteer)
      .innerJoin(volunteerRole, eq(volunteerRole.id, volunteer.roleId))
      .where(eq(volunteer.competitionId, competition.id))

    const judges = judgeRoleRows
      .filter(r => r.roleName.toLowerCase() === 'judge')
      .map(r => ({ id: r.id, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name))

    if (allVolunteerRows.length === 0) return Response.json({ judges: [], workouts: [] })

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

    // Distinct heat numbers + occupied lanes per workout (from athlete assignments)
    const [heatRows, completedRows] = await Promise.all([
      db.select({ workoutId: heatAssignment.workoutId, heatNumber: heatAssignment.heatNumber, lane: heatAssignment.lane })
        .from(heatAssignment)
        .where(inArray(heatAssignment.workoutId, workoutIds)),
      db.select({ workoutId: heatCompletion.workoutId, heatNumber: heatCompletion.heatNumber })
        .from(heatCompletion)
        .where(inArray(heatCompletion.workoutId, workoutIds)),
    ])

    const completedSet = new Set(completedRows.map(r => `${r.workoutId}-${r.heatNumber}`))

    const heatsByWorkout = new Map<number, Set<number>>()
    // occupiedLanes: key = "workoutId-heatNumber", value = set of lane numbers with athletes
    const occupiedLanes = new Map<string, Set<number>>()
    for (const r of heatRows) {
      if (completedSet.has(`${r.workoutId}-${r.heatNumber}`)) continue
      if (!heatsByWorkout.has(r.workoutId)) heatsByWorkout.set(r.workoutId, new Set())
      heatsByWorkout.get(r.workoutId)!.add(r.heatNumber)
      const key = `${r.workoutId}-${r.heatNumber}`
      if (!occupiedLanes.has(key)) occupiedLanes.set(key, new Set())
      occupiedLanes.get(key)!.add(r.lane)
    }

    const judgeMap = new Map(allVolunteerRows.map(v => [v.id, v.name]))

    const result = workouts.map(wk => {
      const heatNums = [...(heatsByWorkout.get(wk.id) ?? [])].sort((a, b) => a - b)
      const wkAssignments = assignments.filter(a => a.workoutId === wk.id)

      const heats = heatNums.map(heatNumber => {
        const heatMs = calcHeatStartMs(
          heatNumber, wk.startTime, wk.heatIntervalSecs, wk.heatStartOverrides, wk.timeBetweenHeatsSecs,
        )
        const walkoutTimeMs = heatMs != null && wk.walkoutTimeSecs != null
          ? heatMs - wk.walkoutTimeSecs * 1000
          : heatMs
        return {
          heatNumber,
          heatTimeMs: heatMs,
          walkoutTimeMs,
          assignments: wkAssignments
            .filter(a => a.heatNumber === heatNumber && (occupiedLanes.get(`${wk.id}-${heatNumber}`)?.has(a.lane) ?? false))
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
    console.error(e)
    return new Response('Internal server error', { status: 500 })
  }
}
