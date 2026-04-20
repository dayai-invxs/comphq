import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { name, order } = await req.json()

  const division = await prisma.division.update({
    where: { id: Number(id) },
    data: {
      ...(name?.trim() && { name: name.trim() }),
      ...(order != null && { order: Number(order) }),
    },
  })
  return Response.json(division)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  await prisma.division.delete({ where: { id: Number(id) } })
  return new Response(null, { status: 204 })
}
