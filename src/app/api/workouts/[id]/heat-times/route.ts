import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { HeatTimeSet } from '@/lib/schemas'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, HeatTimeSet)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')
    const { id } = await params
    const workoutId = Number(id)
    const workout = await requireWorkoutInCompetition<{ heatStartOverrides: string }>(
      workoutId,
      competition.id,
      'heatStartOverrides',
    )

    const { heatNumber, isoTime } = parsed.data

    const overrides: Record<string, string> = JSON.parse(workout.heatStartOverrides || '{}')
    for (const key of Object.keys(overrides)) {
      if (Number(key) >= heatNumber) delete overrides[key]
    }
    overrides[String(heatNumber)] = isoTime

    const { data, error } = await supabase
      .from('Workout')
      .update({ heatStartOverrides: JSON.stringify(overrides) })
      .eq('id', workoutId)
      .select('*')
      .single()

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data)
  } catch (e) {
    return authErrorResponse(e)
  }
}
