import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireSession } from '@/lib/auth-competition'

/**
 * "Competitions I can admin." Super admins see all; regular admins see
 * only the ones they have a CompetitionAdmin row for. Used by the /admin
 * layouts to decide where to route the user (the public list lives at
 * GET /api/competitions).
 */
export async function GET() {
  try {
    const user = await requireSession()
    if (user.isSuper) {
      const { data, error } = await supabase.from('Competition').select('*').order('id')
      if (error) return new Response(error.message, { status: 500 })
      return Response.json(data ?? [])
    }
    const { data, error } = await supabase
      .from('Competition')
      .select('*, CompetitionAdmin!inner(userId)')
      .eq('CompetitionAdmin.userId', user.id)
      .order('id')
    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data ?? [])
  } catch (e) {
    return authErrorResponse(e)
  }
}
