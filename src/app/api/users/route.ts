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
type ProfileRow = { id: string; isSuper: boolean }
type MembershipRow = {
  userId: string
  competitionId: number
  Competition: { id: number; name: string; slug: string } | null
}

export async function GET() {
  try {
    await requireSiteAdmin()

    // Pull auth.users (email) + UserProfile (isSuper) + CompetitionAdmin memberships.
    const { data: authRes, error: authErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (authErr) return new Response(authErr.message, { status: 500 })

    const { data: profiles } = await supabase.from('UserProfile').select('id, isSuper')
    const { data: members } = await supabase
      .from('CompetitionAdmin')
      .select('userId, competitionId, Competition(id, name, slug)')

    const profileById = new Map((profiles as ProfileRow[] | null | undefined ?? []).map((p) => [p.id, p.isSuper]))
    const compsByUser = new Map<string, { id: number; name: string; slug: string }[]>()
    for (const m of (members as MembershipRow[] | null | undefined ?? [])) {
      if (!m.Competition) continue
      if (!compsByUser.has(m.userId)) compsByUser.set(m.userId, [])
      compsByUser.get(m.userId)!.push(m.Competition)
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
      await supabase.from('UserProfile').upsert({ id: userId, isSuper: true }, { onConflict: 'id' })
    }

    // Grant comp memberships.
    if (competitionIds?.length) {
      const rows = competitionIds.map((competitionId) => ({ userId, competitionId }))
      const { error: mErr } = await supabase.from('CompetitionAdmin').insert(rows)
      if (mErr) return new Response(`User created but membership insert failed: ${mErr.message}`, { status: 500 })
    }

    return Response.json({ id: userId, email, isSuper: !!isSuper }, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
