import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'

export async function GET() {
  const divisions = await sql`SELECT * FROM "Division" ORDER BY "order"`
  return Response.json(divisions)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { name, order } = await req.json()
  if (!name?.trim()) return new Response('Name required', { status: 400 })

  const [division] = await sql`
    INSERT INTO "Division" (name, "order") VALUES (${name.trim()}, ${Number(order)}) RETURNING *
  `
  return Response.json(division, { status: 201 })
}
