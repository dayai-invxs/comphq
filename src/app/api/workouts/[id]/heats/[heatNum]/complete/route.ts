import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { calculateRankings } from '@/lib/scoring'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; heatNum: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id, heatNum } = await params
  const workoutId = Number(id)
  const heatNumber = Number(heatNum)

  const [workout] = await sql`SELECT * FROM "Workout" WHERE id = ${workoutId}`
  if (!workout) return new Response('Not found', { status: 404 })

  const completed: number[] = JSON.parse(workout.completedHeats as string || '[]')
  if (!completed.includes(heatNumber)) completed.push(heatNumber)
  completed.sort((a, b) => a - b)

  const [scores, assignments] = await Promise.all([
    sql`SELECT * FROM "Score" WHERE "workoutId" = ${workoutId}`,
    sql`SELECT DISTINCT "heatNumber" FROM "HeatAssignment" WHERE "workoutId" = ${workoutId}`,
  ])

  const ranked = calculateRankings(
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
    ranked.map(({ athleteId, points }) =>
      sql`UPDATE "Score" SET points = ${points}, "partBPoints" = ${partBPointsMap.get(athleteId) ?? null}
          WHERE "athleteId" = ${athleteId} AND "workoutId" = ${workoutId}`
    )
  )

  const allHeatNums = assignments.map((a) => a.heatNumber as number)
  const workoutDone = allHeatNums.every((n) => completed.includes(n))

  await sql`
    UPDATE "Workout" SET
      "completedHeats" = ${JSON.stringify(completed)},
      status = ${workoutDone ? 'completed' : workout.status as string}
    WHERE id = ${workoutId}
  `

  return Response.json({ completedHeats: completed, workoutCompleted: workoutDone })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; heatNum: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id, heatNum } = await params
  const workoutId = Number(id)
  const heatNumber = Number(heatNum)

  const [workout] = await sql`SELECT * FROM "Workout" WHERE id = ${workoutId}`
  if (!workout) return new Response('Not found', { status: 404 })

  const completed: number[] = JSON.parse(workout.completedHeats as string || '[]')
  const updated = completed.filter((n) => n !== heatNumber)

  const heatAthletes = await sql`
    SELECT "athleteId" FROM "HeatAssignment" WHERE "workoutId" = ${workoutId} AND "heatNumber" = ${heatNumber}
  `
  const athleteIds = heatAthletes.map((a) => a.athleteId as number)
  if (athleteIds.length > 0) {
    await sql`
      UPDATE "Score" SET points = NULL WHERE "athleteId" = ANY(${athleteIds}) AND "workoutId" = ${workoutId}
    `
  }

  await sql`
    UPDATE "Workout" SET
      "completedHeats" = ${JSON.stringify(updated)},
      status = ${workout.status === 'completed' ? 'active' : workout.status as string}
    WHERE id = ${workoutId}
  `

  return Response.json({ completedHeats: updated })
}
