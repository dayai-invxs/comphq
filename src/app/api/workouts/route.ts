import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'

export async function GET() {
  const workouts = await sql`SELECT * FROM "Workout" ORDER BY number`
  return Response.json(workouts)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const [workout] = await sql`
    INSERT INTO "Workout" (
      number, name, "scoreType", lanes, "heatIntervalSecs", "timeBetweenHeatsSecs",
      "callTimeSecs", "walkoutTimeSecs", "startTime", status, "mixedHeats",
      "tiebreakEnabled", "partBEnabled", "partBScoreType"
    ) VALUES (
      ${Number(body.number)}, ${body.name.trim()}, ${body.scoreType},
      ${Number(body.lanes)}, ${Number(body.heatIntervalSecs)},
      ${body.timeBetweenHeatsSecs != null ? Number(body.timeBetweenHeatsSecs) : 120},
      ${Number(body.callTimeSecs)}, ${Number(body.walkoutTimeSecs)},
      ${body.startTime ? new Date(body.startTime) : null},
      'draft', ${body.mixedHeats !== false}, ${body.tiebreakEnabled === true},
      ${body.partBEnabled === true}, ${body.partBScoreType ?? 'time'}
    ) RETURNING *
  `
  return Response.json(workout, { status: 201 })
}
