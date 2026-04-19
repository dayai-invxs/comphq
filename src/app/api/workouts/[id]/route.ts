import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, ctx: RouteContext<'/api/workouts/[id]'>) {
  const { id } = await ctx.params
  const workout = await prisma.workout.findUnique({
    where: { id: Number(id) },
    include: {
      assignments: { include: { athlete: { include: { division: true } } }, orderBy: [{ heatNumber: 'asc' }, { lane: 'asc' }] },
      scores: { include: { athlete: true } },
    },
  })
  if (!workout) return new Response('Not found', { status: 404 })
  return Response.json(workout)
}

export async function PUT(req: Request, ctx: RouteContext<'/api/workouts/[id]'>) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  const body = await req.json()

  const workout = await prisma.workout.update({
    where: { id: Number(id) },
    data: {
      ...(body.name && { name: body.name.trim() }),
      ...(body.scoreType && { scoreType: body.scoreType }),
      ...(body.lanes != null && { lanes: Number(body.lanes) }),
      ...(body.heatIntervalSecs != null && { heatIntervalSecs: Number(body.heatIntervalSecs) }),
      ...(body.timeBetweenHeatsSecs != null && { timeBetweenHeatsSecs: Number(body.timeBetweenHeatsSecs) }),
      ...(body.callTimeSecs != null && { callTimeSecs: Number(body.callTimeSecs) }),
      ...(body.walkoutTimeSecs != null && { walkoutTimeSecs: Number(body.walkoutTimeSecs) }),
      ...(body.startTime !== undefined && { startTime: body.startTime ? new Date(body.startTime) : null }),
      ...(body.status && { status: body.status }),
      ...(body.mixedHeats !== undefined && { mixedHeats: Boolean(body.mixedHeats) }),
      ...(body.tiebreakEnabled !== undefined && { tiebreakEnabled: Boolean(body.tiebreakEnabled) }),
      ...(body.number != null && { number: Number(body.number) }),
    },
  })
  return Response.json(workout)
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/workouts/[id]'>) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  await prisma.workout.delete({ where: { id: Number(id) } })
  return new Response(null, { status: 204 })
}
