import { supabase } from '@/lib/supabase'
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
    const workout = await requireWorkoutInCompetition<{ heatStartOverrides: Record<string, string> | string | null }>(
      workoutId,
      competition.id,
      'heatStartOverrides',
    )

    const { heatNumber, isoTime } = parsed.data

    // Column is jsonb; legacy rows may still surface as a stringified blob.
    const existing = workout.heatStartOverrides
    const overrides: Record<string, string> =
      typeof existing === 'string' ? JSON.parse(existing || '{}') : (existing ?? {})
    for (const key of Object.keys(overrides)) {
      if (Number(key) >= heatNumber) delete overrides[key]
    }
    overrides[String(heatNumber)] = isoTime

    const { data, error } = await supabase
      .from('Workout')
      .update({ heatStartOverrides: overrides })
      .eq('id', workoutId)
      .select('*')
      .single()

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data)
  } catch (e) {
    return authErrorResponse(e)
  }
}
