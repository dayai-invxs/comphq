import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const athletes = await prisma.athlete.findMany({ orderBy: { name: 'asc' }, include: { division: true } })
  return Response.json(athletes)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { name, bibNumber, divisionId } = body as { name: string; bibNumber?: string; divisionId?: number | null }

  if (!name?.trim()) return new Response('Name required', { status: 400 })

  const athlete = await prisma.athlete.create({
    data: {
      name: name.trim(),
      bibNumber: bibNumber?.trim() || null,
      divisionId: divisionId ?? null,
    },
    include: { division: true },
  })
  return Response.json(athlete, { status: 201 })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { ids } = await req.json() as { ids: number[] }
  if (!Array.isArray(ids) || ids.length === 0) return new Response('No ids provided', { status: 400 })

  const { count } = await prisma.athlete.deleteMany({ where: { id: { in: ids } } })
  return Response.json({ deleted: count })
}
