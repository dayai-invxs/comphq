import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireSiteAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { z } from 'zod'

const UserUpdate = z.object({
  isSuper: z.boolean().optional(),
  competitionIds: z.array(z.number().int().positive()).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = await parseJson(req, UserUpdate)
  if (!parsed.ok) return parsed.response

  try {
    await requireSiteAdmin()
    const { id: userId } = await params
    const { isSuper, competitionIds } = parsed.data

    if (isSuper !== undefined) {
      const { error } = await supabase
        .from('UserProfile')
        .upsert({ id: userId, isSuper }, { onConflict: 'id' })
      if (error) return new Response(error.message, { status: 500 })
    }

    if (competitionIds !== undefined) {
      // Sync: remove current rows, insert requested.
      const { error: dErr } = await supabase.from('CompetitionAdmin').delete().eq('userId', userId)
      if (dErr) return new Response(dErr.message, { status: 500 })

      if (competitionIds.length > 0) {
        const rows = competitionIds.map((competitionId) => ({ userId, competitionId }))
        const { error: iErr } = await supabase.from('CompetitionAdmin').insert(rows)
        if (iErr) return new Response(iErr.message, { status: 500 })
      }
    }

    return Response.json({ ok: true })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireSiteAdmin()
    const { id: targetId } = await params

    // Guardrail: a super admin cannot delete themselves. Otherwise they could
    // lock themselves out of the admin UI entirely.
    if (actor.id === targetId) {
      return new Response('Cannot delete your own account', { status: 400 })
    }

    const { error } = await supabase.auth.admin.deleteUser(targetId)
    if (error) return new Response(error.message, { status: 500 })

    // UserProfile + CompetitionAdmin rows cascade via FK ON DELETE CASCADE.
    return Response.json({ ok: true })
  } catch (e) {
    return authErrorResponse(e)
  }
}
