import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const workouts = await prisma.workout.findMany({ orderBy: { number: 'asc' } })
  return Response.json(workouts)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const {
    number,
    name,
    scoreType,
    lanes,
    heatIntervalSecs,
    callTimeSecs,
    walkoutTimeSecs,
    startTime,
    mixedHeats,
  } = body

  const workout = await prisma.workout.create({
    data: {
      number: Number(number),
      name: name.trim(),
      scoreType,
      lanes: Number(lanes),
      heatIntervalSecs: Number(heatIntervalSecs),
      timeBetweenHeatsSecs: body.timeBetweenHeatsSecs != null ? Number(body.timeBetweenHeatsSecs) : 120,
      callTimeSecs: Number(callTimeSecs),
      walkoutTimeSecs: Number(walkoutTimeSecs),
      startTime: startTime ? new Date(startTime) : null,
      status: 'draft',
      mixedHeats: mixedHeats !== false,
      tiebreakEnabled: body.tiebreakEnabled === true,
    },
  })
  return Response.json(workout, { status: 201 })
}
