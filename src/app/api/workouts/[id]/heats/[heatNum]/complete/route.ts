import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateRankings } from '@/lib/scoring'

export async function POST(_req: Request, ctx: RouteContext<'/api/workouts/[id]/heats/[heatNum]/complete'>) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id, heatNum } = await ctx.params
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

  // Recalculate rankings for all athletes with scores in this workout
  const scores = await prisma.score.findMany({ where: { workoutId } })
  const ranked = calculateRankings(
    scores.map((s) => ({ athleteId: s.athleteId, rawScore: s.rawScore, tiebreakRawScore: s.tiebreakRawScore })),
    workout.scoreType,
    workout.tiebreakEnabled
  )
  await prisma.$transaction(
    ranked.map(({ athleteId, points }) =>
      prisma.score.update({
        where: { athleteId_workoutId: { athleteId, workoutId } },
        data: { points },
      })
    )
  )

  // If all heats are now complete, mark the workout completed
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

// Undo heat completion
export async function DELETE(_req: Request, ctx: RouteContext<'/api/workouts/[id]/heats/[heatNum]/complete'>) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id, heatNum } = await ctx.params
  const workoutId = Number(id)
  const heatNumber = Number(heatNum)

  const workout = await prisma.workout.findUnique({ where: { id: workoutId } })
  if (!workout) return new Response('Not found', { status: 404 })

  const completed: number[] = JSON.parse(workout.completedHeats || '[]')
  const updated = completed.filter((n) => n !== heatNumber)

  // Clear points for athletes in this heat so rankings show as pending
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
      // If workout was marked completed, revert to active
      ...(workout.status === 'completed' && { status: 'active' }),
    },
  })

  return Response.json({ completedHeats: updated })
}
