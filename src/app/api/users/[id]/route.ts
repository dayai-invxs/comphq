import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { password } = await req.json()
  if (!password || password.length < 6) return new Response('Password must be at least 6 characters', { status: 400 })

  const hashed = await bcrypt.hash(password, 10)
  const [user] = await sql`
    UPDATE "User" SET password = ${hashed} WHERE id = ${Number(id)} RETURNING id, username
  `
  return Response.json(user)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const [{ count }] = await sql<[{ count: string }]>`SELECT count(*)::text FROM "User"`
  if (Number(count) <= 1) return new Response('Cannot delete the last user', { status: 400 })

  await sql`DELETE FROM "User" WHERE id = ${Number(id)}`
  return new Response(null, { status: 204 })
}
