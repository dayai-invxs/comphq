import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { assignHeats, calcCumulativePoints } from '@/lib/scoring'

export async function GET(_req: Request, ctx: RouteContext<'/api/workouts/[id]/assignments'>) {
  const { id } = await ctx.params
  const assignments = await prisma.heatAssignment.findMany({
    where: { workoutId: Number(id) },
    include: { athlete: { include: { division: true } } },
    orderBy: [{ heatNumber: 'asc' }, { lane: 'asc' }],
  })
  return Response.json(assignments)
}

export async function POST(req: Request, ctx: RouteContext<'/api/workouts/[id]/assignments'>) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  const workoutId = Number(id)

  const workout = await prisma.workout.findUnique({ where: { id: workoutId } })
  if (!workout) return new Response('Not found', { status: 404 })

  const body = await req.json().catch(() => ({}))
  const useCumulative = body?.useCumulative === true

  const athletes = await prisma.athlete.findMany({ include: { scores: true } })
  const divisions = await prisma.division.findMany()
  const divisionOrder = new Map(divisions.map((d) => [d.id, d.order]))

  let cumulativePoints: Map<number, number> | undefined
  if (useCumulative) {
    const completedWorkouts = await prisma.workout.findMany({
      where: { status: 'completed' },
      select: { id: true },
    })
    cumulativePoints = calcCumulativePoints(athletes, completedWorkouts.map((w) => w.id))
  }

  const newAssignments = assignHeats(athletes, workout.lanes, {
    cumulativePoints,
    mixedHeats: workout.mixedHeats,
    divisionOrder,
  })

  await prisma.$transaction([
    prisma.heatAssignment.deleteMany({ where: { workoutId } }),
    prisma.heatAssignment.createMany({
      data: newAssignments.map((a) => ({ ...a, workoutId })),
    }),
    prisma.workout.update({ where: { id: workoutId }, data: { heatStartOverrides: '{}' } }),
  ])

  const result = await prisma.heatAssignment.findMany({
    where: { workoutId },
    include: { athlete: { include: { division: true } } },
    orderBy: [{ heatNumber: 'asc' }, { lane: 'asc' }],
  })
  return Response.json(result, { status: 201 })
}

export async function PATCH(req: Request, ctx: RouteContext<'/api/workouts/[id]/assignments'>) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { id: assignmentId, heatNumber, lane } = body as { id: number; heatNumber: number; lane: number }

  const updated = await prisma.heatAssignment.update({
    where: { id: Number(assignmentId) },
    data: { heatNumber: Number(heatNumber), lane: Number(lane) },
    include: { athlete: { include: { division: true } } },
  })
  return Response.json(updated)
}
