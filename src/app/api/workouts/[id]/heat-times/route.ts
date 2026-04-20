import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const workoutId = Number(id)
  const { heatNumber, isoTime } = await req.json() as { heatNumber: number; isoTime: string }

  const { data: workout } = await supabase
    .from('Workout')
    .select('*')
    .eq('id', workoutId)
    .maybeSingle()
  if (!workout) return new Response('Not found', { status: 404 })

  const overrides: Record<string, string> = JSON.parse(
    (workout as { heatStartOverrides: string }).heatStartOverrides || '{}',
  )
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
}
