import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { name, bibNumber, divisionId } = await req.json()
  if (!name?.trim()) return new Response('Name required', { status: 400 })

  const sets: string[] = [`name = $1`, `"bibNumber" = $2`]
  const values: (string | number | null)[] = [name.trim(), bibNumber?.trim() || null]

  if (divisionId !== undefined) {
    sets.push(`"divisionId" = $${values.length + 1}`)
    values.push(divisionId ?? null)
  }
  values.push(Number(id))

  const [athlete] = await sql.unsafe(`
    WITH updated AS (
      UPDATE "Athlete" SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *
    )
    SELECT a.*,
      CASE WHEN d.id IS NOT NULL THEN
        jsonb_build_object('id', d.id, 'name', d.name, 'order', d."order")
      ELSE NULL END as division
    FROM updated a
    LEFT JOIN "Division" d ON a."divisionId" = d.id
  `, values)

  return Response.json(athlete)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  await sql`DELETE FROM "Athlete" WHERE id = ${Number(id)}`
  return new Response(null, { status: 204 })
}
