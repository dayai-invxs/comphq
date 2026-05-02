import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { competitionAdmin } from '@/db/schema'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'

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
