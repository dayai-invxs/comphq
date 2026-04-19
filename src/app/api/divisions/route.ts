import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const divisions = await prisma.division.findMany({ orderBy: { order: 'asc' } })
  return Response.json(divisions)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { name, order } = await req.json()
  if (!name?.trim()) return new Response('Name required', { status: 400 })

  const division = await prisma.division.create({
    data: { name: name.trim(), order: Number(order) },
  })
  return Response.json(division, { status: 201 })
}
