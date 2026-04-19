import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: Request, ctx: RouteContext<'/api/athletes/[id]'>) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  const { name, bibNumber, divisionId } = await req.json()

  if (!name?.trim()) return new Response('Name required', { status: 400 })

  const athlete = await prisma.athlete.update({
    where: { id: Number(id) },
    data: {
      name: name.trim(),
      bibNumber: bibNumber?.trim() || null,
      divisionId: divisionId !== undefined ? (divisionId ?? null) : undefined,
    },
    include: { division: true },
  })
  return Response.json(athlete)
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/athletes/[id]'>) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  await prisma.athlete.delete({ where: { id: Number(id) } })
  return new Response(null, { status: 204 })
}
