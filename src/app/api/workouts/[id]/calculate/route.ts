import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateRankings } from '@/lib/scoring'

export async function POST(_req: Request, ctx: RouteContext<'/api/workouts/[id]/calculate'>) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  const workoutId = Number(id)

  const workout = await prisma.workout.findUnique({ where: { id: workoutId } })
  if (!workout) return new Response('Not found', { status: 404 })

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

  await prisma.workout.update({ where: { id: workoutId }, data: { status: 'completed' } })

  return Response.json({ message: 'Rankings calculated', count: ranked.length })
}
