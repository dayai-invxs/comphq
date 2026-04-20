import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const users = await sql`SELECT id, username FROM "User" ORDER BY id`
  return Response.json(users)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { username, password } = await req.json()
  if (!username?.trim()) return new Response('Username required', { status: 400 })
  if (!password || password.length < 6) return new Response('Password must be at least 6 characters', { status: 400 })

  const [existing] = await sql`SELECT id FROM "User" WHERE username = ${username.trim()}`
  if (existing) return new Response('Username already taken', { status: 409 })

  const hashed = await bcrypt.hash(password, 10)
  const [user] = await sql`
    INSERT INTO "User" (username, password) VALUES (${username.trim()}, ${hashed})
    RETURNING id, username
  `
  return Response.json(user, { status: 201 })
}
