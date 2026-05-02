import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { competitionAdmin } from '@/db/schema'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { z } from 'zod'

const RoleUpdate = z.object({
  slug: z.string().min(1),
  role: z.enum(['admin', 'user']),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const parsed = await parseJson(req, RoleUpdate)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAdmin(parsed.data.slug)
    const { userId } = await params

    await db
      .update(competitionAdmin)
      .set({ role: parsed.data.role })
      .where(and(
        eq(competitionAdmin.userId, userId),
        eq(competitionAdmin.competitionId, competition.id),
      ))

    return Response.json({ ok: true })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { user: actor, competition } = await requireCompetitionAdmin(slug)
    const { userId } = await params

    if (actor.id === userId) {
      return new Response('Cannot remove yourself', { status: 400 })
    }

    await db
      .delete(competitionAdmin)
      .where(and(
        eq(competitionAdmin.userId, userId),
        eq(competitionAdmin.competitionId, competition.id),
      ))

    return Response.json({ ok: true })
  } catch (e) {
    return authErrorResponse(e)
  }
}
