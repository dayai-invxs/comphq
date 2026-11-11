import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; equipmentId: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id, equipmentId } = await params

    // Join through Workout to enforce competition ownership
    const { data: workout } = await supabase
      .from('Workout').select('id').eq('id', Number(id)).eq('competitionId', competition.id).maybeSingle()
    if (!workout) return new Response('Not found', { status: 404 })

    const { error } = await supabase
      .from('WorkoutEquipment')
      .delete()
      .eq('id', Number(equipmentId))
      .eq('workoutId', Number(id))
    if (error) return new Response(error.message, { status: 500 })
    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
