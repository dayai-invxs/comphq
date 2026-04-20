import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const workoutId = Number(id)
  const { heatNumber, isoTime } = await req.json() as { heatNumber: number; isoTime: string }

  const workout = await prisma.workout.findUnique({ where: { id: workoutId } })
  if (!workout) return new Response('Not found', { status: 404 })

  const overrides: Record<string, string> = JSON.parse(workout.heatStartOverrides || '{}')

  for (const key of Object.keys(overrides)) {
    if (Number(key) >= heatNumber) delete overrides[key]
  }
  overrides[String(heatNumber)] = isoTime

  const updated = await prisma.workout.update({
    where: { id: workoutId },
    data: { heatStartOverrides: JSON.stringify(overrides) },
  })

  return Response.json(updated)
}
