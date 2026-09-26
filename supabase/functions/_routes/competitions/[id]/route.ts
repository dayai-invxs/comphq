import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { competition } from '@/db/schema'
import { authErrorResponse, requireSiteAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { CompetitionUpdate } from '@/lib/schemas'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = await parseJson(req, CompetitionUpdate)
  if (!parsed.ok) return parsed.response

  try {
    await requireSiteAdmin()
    const { id } = await params
    const updates: { name?: string; slug?: string } = {}
    if (parsed.data.name) updates.name = parsed.data.name
    if (parsed.data.slug) {
      const cleanSlug = parsed.data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(cleanSlug)) {
        return new Response('Slug must be alphanumeric (dashes allowed internally)', { status: 400 })
      }
      updates.slug = cleanSlug
    }

    const [updated] = await db
      .update(competition)
      .set(updates)
      .where(eq(competition.id, Number(id)))
      .returning()

    if (!updated) return new Response('Not found', { status: 404 })
    return Response.json(updated)
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSiteAdmin()
    const { id } = await params
    await db.delete(competition).where(eq(competition.id, Number(id)))
    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
