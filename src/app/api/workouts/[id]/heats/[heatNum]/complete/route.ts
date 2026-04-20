import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateRankings } from '@/lib/scoring'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; heatNum: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id, heatNum } = await params
  const workoutId = Number(id)
  const heatNumber = Number(heatNum)

  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: { assignments: true },
  })
  if (!workout) return new Response('Not found', { status: 404 })

  const completed: number[] = JSON.parse(workout.completedHeats || '[]')
  if (!completed.includes(heatNumber)) completed.push(heatNumber)
  completed.sort((a, b) => a - b)

  const scores = await prisma.score.findMany({ where: { workoutId } })
  const ranked = calculateRankings(
    scores.map((s) => ({ athleteId: s.athleteId, rawScore: s.rawScore, tiebreakRawScore: s.tiebreakRawScore })),
    workout.scoreType,
    workout.tiebreakEnabled
  )
  const partBScores = scores.filter((s) => s.partBRawScore != null)
  const rankedB = workout.partBEnabled && partBScores.length > 0
    ? calculateRankings(
        partBScores.map((s) => ({ athleteId: s.athleteId, rawScore: s.partBRawScore! })),
        workout.partBScoreType
      )
    : []
  const partBPointsMap = new Map(rankedB.map(({ athleteId, points }) => [athleteId, points]))
  await prisma.$transaction(
    ranked.map(({ athleteId, points }) =>
      prisma.score.update({
        where: { athleteId_workoutId: { athleteId, workoutId } },
        data: { points, partBPoints: partBPointsMap.get(athleteId) ?? null },
      })
    )
  )

  const allHeatNums = [...new Set(workout.assignments.map((a) => a.heatNumber))]
  const workoutDone = allHeatNums.every((n) => completed.includes(n))

  await prisma.workout.update({
    where: { id: workoutId },
    data: {
      completedHeats: JSON.stringify(completed),
      ...(workoutDone && { status: 'completed' }),
    },
  })

  return Response.json({ completedHeats: completed, workoutCompleted: workoutDone })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; heatNum: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id, heatNum } = await params
  const workoutId = Number(id)
  const heatNumber = Number(heatNum)

  const workout = await prisma.workout.findUnique({ where: { id: workoutId } })
  if (!workout) return new Response('Not found', { status: 404 })

  const completed: number[] = JSON.parse(workout.completedHeats || '[]')
  const updated = completed.filter((n) => n !== heatNumber)

  const heatAthletes = await prisma.heatAssignment.findMany({
    where: { workoutId, heatNumber },
    select: { athleteId: true },
  })
  await prisma.$transaction(
    heatAthletes.map(({ athleteId }) =>
      prisma.score.updateMany({
        where: { athleteId, workoutId },
        data: { points: null },
      })
    )
  )

  await prisma.workout.update({
    where: { id: workoutId },
    data: {
      completedHeats: JSON.stringify(updated),
      ...(workout.status === 'completed' && { status: 'active' }),
    },
  })

  return Response.json({ completedHeats: updated })
}
