import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function PUT(req: Request, ctx: RouteContext<'/api/users/[id]'>) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  const { password } = await req.json()
  if (!password || password.length < 6) return new Response('Password must be at least 6 characters', { status: 400 })

  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.update({
    where: { id: Number(id) },
    data: { password: hashed },
    select: { id: true, username: true },
  })
  return Response.json(user)
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/users/[id]'>) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await ctx.params

  const total = await prisma.user.count()
  if (total <= 1) return new Response('Cannot delete the last user', { status: 400 })

  await prisma.user.delete({ where: { id: Number(id) } })
  return new Response(null, { status: 204 })
}
