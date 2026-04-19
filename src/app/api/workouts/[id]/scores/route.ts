import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, ctx: RouteContext<'/api/workouts/[id]/scores'>) {
  const { id } = await ctx.params
  const scores = await prisma.score.findMany({
    where: { workoutId: Number(id) },
    include: { athlete: true },
  })
  return Response.json(scores)
}

// POST upserts a score for one athlete in this workout
export async function POST(req: Request, ctx: RouteContext<'/api/workouts/[id]/scores'>) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  const workoutId = Number(id)
  const body = await req.json()
  const { athleteId, rawScore, tiebreakRawScore } = body as { athleteId: number; rawScore: number; tiebreakRawScore?: number | null }

  const score = await prisma.score.upsert({
    where: { athleteId_workoutId: { athleteId: Number(athleteId), workoutId } },
    update: { rawScore: Number(rawScore), tiebreakRawScore: tiebreakRawScore ?? null, points: null },
    create: { athleteId: Number(athleteId), workoutId, rawScore: Number(rawScore), tiebreakRawScore: tiebreakRawScore ?? null, points: null },
  })
  return Response.json(score)
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/workouts/[id]/scores'>) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  const { count } = await prisma.score.deleteMany({ where: { workoutId: Number(id) } })
  // Reset workout status to active if it was completed
  await prisma.workout.updateMany({
    where: { id: Number(id), status: 'completed' },
    data: { status: 'active' },
  })
  return Response.json({ deleted: count })
}
