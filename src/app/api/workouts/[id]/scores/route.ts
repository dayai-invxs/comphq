import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scores = await prisma.score.findMany({
    where: { workoutId: Number(id) },
    include: { athlete: true },
  })
  return Response.json(scores)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const workoutId = Number(id)
  const body = await req.json()
  const { athleteId, rawScore, tiebreakRawScore, partBRawScore } = body as {
    athleteId: number
    rawScore: number
    tiebreakRawScore?: number | null
    partBRawScore?: number | null
  }

  const score = await prisma.score.upsert({
    where: { athleteId_workoutId: { athleteId: Number(athleteId), workoutId } },
    update: { rawScore: Number(rawScore), tiebreakRawScore: tiebreakRawScore ?? null, points: null, partBRawScore: partBRawScore ?? null, partBPoints: null },
    create: { athleteId: Number(athleteId), workoutId, rawScore: Number(rawScore), tiebreakRawScore: tiebreakRawScore ?? null, points: null, partBRawScore: partBRawScore ?? null, partBPoints: null },
  })
  return Response.json(score)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { count } = await prisma.score.deleteMany({ where: { workoutId: Number(id) } })
  await prisma.workout.updateMany({
    where: { id: Number(id), status: 'completed' },
    data: { status: 'active' },
  })
  return Response.json({ deleted: count })
}
