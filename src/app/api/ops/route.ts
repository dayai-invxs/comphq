import { sql } from '@/lib/db'
import { calcHeatStartMs } from '@/lib/heatTime'

export async function GET() {
  const [showBibRow, workouts] = await Promise.all([
    sql`SELECT value FROM "Setting" WHERE key = 'showBib'`,
    sql`SELECT * FROM "Workout" ORDER BY number`,
  ])
  const showBib = (showBibRow[0]?.value as string | undefined) !== 'false'

  const workoutIds = workouts.map((w) => w.id as number)
  const assignments = workoutIds.length > 0 ? await sql`
    SELECT ha.*,
      jsonb_build_object(
        'id', a.id, 'name', a.name, 'bibNumber', a."bibNumber", 'divisionId', a."divisionId",
        'division', CASE WHEN d.id IS NOT NULL THEN
          jsonb_build_object('id', d.id, 'name', d.name, 'order', d."order")
        ELSE NULL END
      ) as athlete
    FROM "HeatAssignment" ha
    JOIN "Athlete" a ON ha."athleteId" = a.id
    LEFT JOIN "Division" d ON a."divisionId" = d.id
    WHERE ha."workoutId" = ANY(${workoutIds})
    ORDER BY ha."heatNumber", ha.lane
  ` : []

  const result = workouts.map((workout) => {
    const completedHeats: number[] = JSON.parse(workout.completedHeats as string || '[]')
    const wAssignments = assignments.filter((a) => a.workoutId === workout.id)
    const heatNums = [...new Set(wAssignments.map((a) => a.heatNumber as number))].sort((a, b) => a - b)

    const heats = heatNums.map((heatNumber) => {
      const heatStartMs = calcHeatStartMs(heatNumber, workout.startTime as string | null, workout.heatIntervalSecs as number, workout.heatStartOverrides as string, workout.timeBetweenHeatsSecs as number)
      const entries = wAssignments
        .filter((a) => a.heatNumber === heatNumber)
        .map((a) => {
          const athlete = a.athlete as { name: string; bibNumber: string | null; division: { name: string } | null }
          return { athleteId: a.athleteId, athleteName: athlete.name, bibNumber: athlete.bibNumber, divisionName: athlete.division?.name ?? null, lane: a.lane }
        })
      return {
        heatNumber, isComplete: completedHeats.includes(heatNumber),
        heatTime: heatStartMs != null ? new Date(heatStartMs).toISOString() : null,
        corralTime: heatStartMs != null ? new Date(heatStartMs - (workout.callTimeSecs as number) * 1000).toISOString() : null,
        walkoutTime: heatStartMs != null ? new Date(heatStartMs - (workout.walkoutTimeSecs as number) * 1000).toISOString() : null,
        entries,
      }
    })

    return { id: workout.id, number: workout.number, name: workout.name, status: workout.status, heats }
  })

  return Response.json({ workouts: result, showBib })
}
