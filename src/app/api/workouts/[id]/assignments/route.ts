import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { assignHeats, calcCumulativePoints } from '@/lib/scoring'
import type { AthleteWithScore } from '@/lib/scoring'

const ASSIGNMENT_SELECT = `
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
`

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const assignments = await sql.unsafe(
    `${ASSIGNMENT_SELECT} WHERE ha."workoutId" = $1 ORDER BY ha."heatNumber", ha.lane`,
    [Number(id)]
  )
  return Response.json(assignments)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const workoutId = Number(id)

  const [workout] = await sql`SELECT * FROM "Workout" WHERE id = ${workoutId}`
  if (!workout) return new Response('Not found', { status: 404 })

  const body = await req.json().catch(() => ({}))
  const useCumulative = body?.useCumulative === true

  const [athletesRaw, divisions] = await Promise.all([
    sql`
      SELECT a.*,
        COALESCE(
          jsonb_agg(jsonb_build_object(
            'id', s.id, 'athleteId', s."athleteId", 'workoutId', s."workoutId",
            'rawScore', s."rawScore", 'tiebreakRawScore', s."tiebreakRawScore",
            'points', s.points, 'partBRawScore', s."partBRawScore", 'partBPoints', s."partBPoints"
          )) FILTER (WHERE s.id IS NOT NULL),
          '[]'::jsonb
        ) as scores
      FROM "Athlete" a
      LEFT JOIN "Score" s ON s."athleteId" = a.id
      GROUP BY a.id
    `,
    sql`SELECT * FROM "Division"`,
  ])

  const athletes = athletesRaw as unknown as AthleteWithScore[]
  const divisionOrder = new Map((divisions as unknown as Array<{ id: number; order: number }>).map((d) => [d.id, d.order]))

  let cumulativePoints: Map<number, number> | undefined
  if (useCumulative) {
    const completedWorkouts = await sql`SELECT id FROM "Workout" WHERE status = 'completed'`
    cumulativePoints = calcCumulativePoints(athletes, completedWorkouts.map((w) => w.id as number))
  }

  const newAssignments = assignHeats(athletes, workout.lanes as number, {
    cumulativePoints,
    mixedHeats: workout.mixedHeats as boolean,
    divisionOrder,
  })

  await sql`DELETE FROM "HeatAssignment" WHERE "workoutId" = ${workoutId}`
  if (newAssignments.length > 0) {
    await sql`
      INSERT INTO "HeatAssignment" ("workoutId", "athleteId", "heatNumber", lane)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(newAssignments.map(a => ({ ...a, workoutId })))}::jsonb)
        AS t("workoutId" int, "athleteId" int, "heatNumber" int, lane int)
    `
  }
  await sql`UPDATE "Workout" SET "heatStartOverrides" = '{}' WHERE id = ${workoutId}`

  const result = await sql.unsafe(
    `${ASSIGNMENT_SELECT} WHERE ha."workoutId" = $1 ORDER BY ha."heatNumber", ha.lane`,
    [workoutId]
  )
  return Response.json(result, { status: 201 })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id: assignmentId, heatNumber, lane } = await req.json() as { id: number; heatNumber: number; lane: number }

  const [updated] = await sql.unsafe(
    `${ASSIGNMENT_SELECT} JOIN (
      SELECT id FROM "HeatAssignment" WHERE id = $1
    ) ids ON ha.id = ids.id`,
    [Number(assignmentId)]
  )
  await sql`
    UPDATE "HeatAssignment" SET "heatNumber" = ${Number(heatNumber)}, lane = ${Number(lane)}
    WHERE id = ${Number(assignmentId)}
  `
  // Re-fetch after update to get fresh data
  const [fresh] = await sql.unsafe(
    `${ASSIGNMENT_SELECT} WHERE ha.id = $1`,
    [Number(assignmentId)]
  )
  return Response.json(fresh ?? updated)
}
