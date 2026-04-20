import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scores = await sql`
    SELECT s.*,
      jsonb_build_object('id', a.id, 'name', a.name, 'bibNumber', a."bibNumber", 'divisionId', a."divisionId") as athlete
    FROM "Score" s
    JOIN "Athlete" a ON s."athleteId" = a.id
    WHERE s."workoutId" = ${Number(id)}
  `
  return Response.json(scores)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const workoutId = Number(id)
  const { athleteId, rawScore, tiebreakRawScore, partBRawScore } = await req.json() as {
    athleteId: number; rawScore: number; tiebreakRawScore?: number | null; partBRawScore?: number | null
  }

  const [score] = await sql`
    INSERT INTO "Score" ("athleteId", "workoutId", "rawScore", "tiebreakRawScore", points, "partBRawScore", "partBPoints")
    VALUES (${Number(athleteId)}, ${workoutId}, ${Number(rawScore)}, ${tiebreakRawScore ?? null}, NULL, ${partBRawScore ?? null}, NULL)
    ON CONFLICT ("athleteId", "workoutId") DO UPDATE SET
      "rawScore" = EXCLUDED."rawScore",
      "tiebreakRawScore" = EXCLUDED."tiebreakRawScore",
      points = NULL,
      "partBRawScore" = EXCLUDED."partBRawScore",
      "partBPoints" = NULL
    RETURNING *
  `
  return Response.json(score)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const workoutId = Number(id)

  const deleted = await sql`DELETE FROM "Score" WHERE "workoutId" = ${workoutId} RETURNING id`
  await sql`UPDATE "Workout" SET status = 'active' WHERE id = ${workoutId} AND status = 'completed'`

  return Response.json({ deleted: deleted.length })
}
