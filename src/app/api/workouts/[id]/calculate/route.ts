import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateRankings } from '@/lib/scoring'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const workoutId = Number(id)

  const workout = await prisma.workout.findUnique({ where: { id: workoutId } })
  if (!workout) return new Response('Not found', { status: 404 })

  const scores = await prisma.score.findMany({ where: { workoutId } })

  // Rank Part A
  const rankedA = calculateRankings(
    scores.map((s) => ({ athleteId: s.athleteId, rawScore: s.rawScore, tiebreakRawScore: s.tiebreakRawScore })),
    workout.scoreType,
    workout.tiebreakEnabled
  )

  // Rank Part B (only athletes who have a Part B score)
  const partBScores = scores.filter((s) => s.partBRawScore != null)
  const rankedB = workout.partBEnabled && partBScores.length > 0
    ? calculateRankings(
        partBScores.map((s) => ({ athleteId: s.athleteId, rawScore: s.partBRawScore! })),
        workout.partBScoreType
      )
    : []

  const partBPointsMap = new Map(rankedB.map(({ athleteId, points }) => [athleteId, points]))

  await prisma.$transaction([
    ...rankedA.map(({ athleteId, points }) =>
      prisma.score.update({
        where: { athleteId_workoutId: { athleteId, workoutId } },
        data: { points, partBPoints: partBPointsMap.get(athleteId) ?? null },
      })
    ),
  ])

  await prisma.workout.update({ where: { id: workoutId }, data: { status: 'completed' } })

  return Response.json({ message: 'Rankings calculated', count: rankedA.length })
}
