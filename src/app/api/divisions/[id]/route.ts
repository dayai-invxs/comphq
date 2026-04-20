import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { name, order } = await req.json()

  const sets: string[] = []
  const values: (string | number)[] = []
  if (name?.trim()) { sets.push(`name = $${values.length + 1}`); values.push(name.trim()) }
  if (order != null) { sets.push(`"order" = $${values.length + 1}`); values.push(Number(order)) }
  if (sets.length === 0) return new Response('Nothing to update', { status: 400 })
  values.push(Number(id))

  const [division] = await sql.unsafe(
    `UPDATE "Division" SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  )
  return Response.json(division)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  await sql`DELETE FROM "Division" WHERE id = ${Number(id)}`
  return new Response(null, { status: 204 })
}
