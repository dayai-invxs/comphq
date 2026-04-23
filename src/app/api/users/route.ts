import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userProfile, competitionAdmin, competition } from '@/db/schema'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireSiteAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { z } from 'zod'

const UserCreate = z.object({
  email: z.email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  isSuper: z.boolean().optional(),
  competitionIds: z.array(z.number().int().positive()).optional(),
})

type AdminUser = { id: string; email?: string | null }

export async function GET() {
  try {
    await requireSiteAdmin()

    // auth.users still lives in Supabase Auth — the admin API is the only way
    // to enumerate it. For the app-owned tables (UserProfile + CompetitionAdmin)
    // we hit Drizzle.
    const { data: authRes, error: authErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (authErr) return new Response(authErr.message, { status: 500 })

    const profiles = await db.select({ id: userProfile.id, isSuper: userProfile.isSuper }).from(userProfile)
    const memberships = await db
      .select({
        userId: competitionAdmin.userId,
        competitionId: competition.id,
        name: competition.name,
        slug: competition.slug,
      })
      .from(competitionAdmin)
      .innerJoin(competition, sql`${competition.id} = ${competitionAdmin.competitionId}`)

    const profileById = new Map(profiles.map((p) => [p.id, p.isSuper]))
    const compsByUser = new Map<string, { id: number; name: string; slug: string }[]>()
    for (const m of memberships) {
      if (!compsByUser.has(m.userId)) compsByUser.set(m.userId, [])
      compsByUser.get(m.userId)!.push({ id: m.competitionId, name: m.name, slug: m.slug })
    }

    const rows = (authRes?.users ?? []).map((u: AdminUser) => ({
      id: u.id,
      email: u.email ?? null,
      isSuper: profileById.get(u.id) === true,
      competitions: compsByUser.get(u.id) ?? [],
    }))

    return Response.json(rows)
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request) {
  const parsed = await parseJson(req, UserCreate)
  if (!parsed.ok) return parsed.response

  try {
    await requireSiteAdmin()
    const { email, password, isSuper, competitionIds } = parsed.data

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (createErr) return new Response(createErr.message, { status: 500 })

    const userId = (created as { user: { id: string } | null })?.user?.id
    if (!userId) return new Response('User creation returned no id', { status: 500 })

    // UserProfile row auto-creates via trigger with isSuper=false. Override if requested.
    if (isSuper) {
      await db
        .insert(userProfile)
        .values({ id: userId, isSuper: true })
        .onConflictDoUpdate({ target: userProfile.id, set: { isSuper: true } })
    }

    // Grant comp memberships.
    if (competitionIds?.length) {
      const rows = competitionIds.map((competitionId) => ({ userId, competitionId }))
      try {
        await db.insert(competitionAdmin).values(rows)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown'
        return new Response(`User created but membership insert failed: ${msg}`, { status: 500 })
      }
    }

    return Response.json({ id: userId, email, isSuper: !!isSuper }, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
