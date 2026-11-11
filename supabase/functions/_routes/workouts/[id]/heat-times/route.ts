import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workout } from '@/db/schema'
import { authErrorResponse, requireCompetitionAdmin, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { HeatTimeSet } from '@/lib/schemas'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, HeatTimeSet)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const workoutId = Number(id)
    const wk = await requireWorkoutInCompetition<{
      heatStartOverrides: Record<string, string>
    }>(workoutId, competition.id)

    const { heatNumber, isoTime } = parsed.data

    const overrides: Record<string, string> = { ...wk.heatStartOverrides }
    for (const key of Object.keys(overrides)) {
      if (Number(key) >= heatNumber) delete overrides[key]
    }
    overrides[String(heatNumber)] = isoTime

    const [row] = await db
      .update(workout)
      .set({ heatStartOverrides: overrides })
      .where(eq(workout.id, workoutId))
      .returning()

    return Response.json(row)
  } catch (e) {
    return authErrorResponse(e)
  }
}
