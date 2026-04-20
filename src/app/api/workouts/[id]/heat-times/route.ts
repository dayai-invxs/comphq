import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const workoutId = Number(id)
  const { heatNumber, isoTime } = await req.json() as { heatNumber: number; isoTime: string }

  const [workout] = await sql`SELECT * FROM "Workout" WHERE id = ${workoutId}`
  if (!workout) return new Response('Not found', { status: 404 })

  const overrides: Record<string, string> = JSON.parse(workout.heatStartOverrides as string || '{}')
  for (const key of Object.keys(overrides)) {
    if (Number(key) >= heatNumber) delete overrides[key]
  }
  overrides[String(heatNumber)] = isoTime

  const [updated] = await sql`
    UPDATE "Workout" SET "heatStartOverrides" = ${JSON.stringify(overrides)} WHERE id = ${workoutId} RETURNING *
  `
  return Response.json(updated)
}
