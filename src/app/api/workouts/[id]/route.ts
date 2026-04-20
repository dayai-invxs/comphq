import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workoutId = Number(id)

  const [workout] = await sql`SELECT * FROM "Workout" WHERE id = ${workoutId}`
  if (!workout) return new Response('Not found', { status: 404 })

  const [assignments, scores] = await Promise.all([
    sql`
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
      WHERE ha."workoutId" = ${workoutId}
      ORDER BY ha."heatNumber", ha.lane
    `,
    sql`
      SELECT s.*,
        jsonb_build_object('id', a.id, 'name', a.name, 'bibNumber', a."bibNumber", 'divisionId', a."divisionId") as athlete
      FROM "Score" s
      JOIN "Athlete" a ON s."athleteId" = a.id
      WHERE s."workoutId" = ${workoutId}
    `,
  ])

  return Response.json({ ...workout, assignments, scores })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const body = await req.json()

  const sets: string[] = []
  const values: (string | number | boolean | Date | null)[] = []
  const add = (col: string, val: string | number | boolean | Date | null) => { sets.push(`"${col}" = $${values.length + 1}`); values.push(val) }

  if (body.name) add('name', body.name.trim())
  if (body.scoreType) add('scoreType', body.scoreType)
  if (body.lanes != null) add('lanes', Number(body.lanes))
  if (body.heatIntervalSecs != null) add('heatIntervalSecs', Number(body.heatIntervalSecs))
  if (body.timeBetweenHeatsSecs != null) add('timeBetweenHeatsSecs', Number(body.timeBetweenHeatsSecs))
  if (body.callTimeSecs != null) add('callTimeSecs', Number(body.callTimeSecs))
  if (body.walkoutTimeSecs != null) add('walkoutTimeSecs', Number(body.walkoutTimeSecs))
  if (body.startTime !== undefined) add('startTime', body.startTime ? new Date(body.startTime) : null)
  if (body.status) add('status', body.status)
  if (body.mixedHeats !== undefined) add('mixedHeats', Boolean(body.mixedHeats))
  if (body.tiebreakEnabled !== undefined) add('tiebreakEnabled', Boolean(body.tiebreakEnabled))
  if (body.partBEnabled !== undefined) add('partBEnabled', Boolean(body.partBEnabled))
  if (body.partBScoreType) add('partBScoreType', body.partBScoreType)
  if (body.number != null) add('number', Number(body.number))

  if (sets.length === 0) return new Response('Nothing to update', { status: 400 })
  values.push(Number(id))

  const [workout] = await sql.unsafe(
    `UPDATE "Workout" SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  )
  return Response.json(workout)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  await sql`DELETE FROM "Workout" WHERE id = ${Number(id)}`
  return new Response(null, { status: 204 })
}
