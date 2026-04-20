import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { calculateRankings } from '@/lib/scoring'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const workoutId = Number(id)

  const [workout] = await sql`SELECT * FROM "Workout" WHERE id = ${workoutId}`
  if (!workout) return new Response('Not found', { status: 404 })

  const scores = await sql`SELECT * FROM "Score" WHERE "workoutId" = ${workoutId}`

  const rankedA = calculateRankings(
    scores.map((s) => ({ athleteId: s.athleteId as number, rawScore: s.rawScore as number, tiebreakRawScore: s.tiebreakRawScore as number | null })),
    workout.scoreType as string,
    workout.tiebreakEnabled as boolean
  )

  const partBScores = scores.filter((s) => s.partBRawScore != null)
  const rankedB = (workout.partBEnabled && partBScores.length > 0)
    ? calculateRankings(partBScores.map((s) => ({ athleteId: s.athleteId as number, rawScore: s.partBRawScore as number })), workout.partBScoreType as string)
    : []
  const partBPointsMap = new Map(rankedB.map(({ athleteId, points }) => [athleteId, points]))

  await Promise.all(
    rankedA.map(({ athleteId, points }) =>
      sql`UPDATE "Score" SET points = ${points}, "partBPoints" = ${partBPointsMap.get(athleteId) ?? null}
          WHERE "athleteId" = ${athleteId} AND "workoutId" = ${workoutId}`
    )
  )
  await sql`UPDATE "Workout" SET status = 'completed' WHERE id = ${workoutId}`

  return Response.json({ message: 'Rankings calculated', count: rankedA.length })
}
