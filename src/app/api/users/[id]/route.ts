import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userProfile, competitionAdmin } from '@/db/schema'
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
      await db
        .insert(userProfile)
        .values({ id: userId, isSuper })
        .onConflictDoUpdate({ target: userProfile.id, set: { isSuper } })
    }

    if (competitionIds !== undefined) {
      // Sync: remove current rows, insert requested.
      await db.delete(competitionAdmin).where(eq(competitionAdmin.userId, userId))

      if (competitionIds.length > 0) {
        const rows = competitionIds.map((competitionId) => ({ userId, competitionId }))
        await db.insert(competitionAdmin).values(rows)
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
