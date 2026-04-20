import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'

const WITH_DIVISION = `
  SELECT a.*,
    CASE WHEN d.id IS NOT NULL THEN
      jsonb_build_object('id', d.id, 'name', d.name, 'order', d."order")
    ELSE NULL END as division
  FROM "Athlete" a
  LEFT JOIN "Division" d ON a."divisionId" = d.id
`

export async function GET() {
  const athletes = await sql.unsafe(`${WITH_DIVISION} ORDER BY a.name`)
  return Response.json(athletes)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { name, bibNumber, divisionId } = body as { name: string; bibNumber?: string; divisionId?: number | null }
  if (!name?.trim()) return new Response('Name required', { status: 400 })

  const [athlete] = await sql.unsafe(`
    WITH inserted AS (
      INSERT INTO "Athlete" (name, "bibNumber", "divisionId")
      VALUES ($1, $2, $3) RETURNING *
    ) ${WITH_DIVISION.replace('"Athlete" a', 'inserted a')}
  `, [name.trim(), bibNumber?.trim() || null, divisionId ?? null])

  return Response.json(athlete, { status: 201 })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { ids } = await req.json() as { ids: number[] }
  if (!Array.isArray(ids) || ids.length === 0) return new Response('No ids provided', { status: 400 })

  const deleted = await sql`DELETE FROM "Athlete" WHERE id = ANY(${ids}) RETURNING id`
  return Response.json({ deleted: deleted.length })
}
