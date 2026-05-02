import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { competitionAdmin } from '@/db/schema'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { z } from 'zod'

const AddUser = z.object({
  slug: z.string().min(1),
  email: z.email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  role: z.enum(['admin', 'user']),
})

type CompUser = {
  userId: string
  email: string | null
  role: string
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition } = await requireCompetitionAdmin(slug)

    const rows = await db
      .select({ userId: competitionAdmin.userId, role: competitionAdmin.role })
      .from(competitionAdmin)
      .where(eq(competitionAdmin.competitionId, competition.id))

    // Fetch emails from Supabase auth for each user
    const users: CompUser[] = await Promise.all(
      rows.map(async (row) => {
        const { data } = await supabase.auth.admin.getUserById(row.userId)
        return {
          userId: row.userId,
          email: data?.user?.email ?? null,
          role: row.role,
        }
      })
    )

    return Response.json(users)
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request) {
  const parsed = await parseJson(req, AddUser)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAdmin(parsed.data.slug)
    const { email, password, role } = parsed.data

    // Check if user already exists by email
    const { data: listData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existingUser = listData?.users.find(u => u.email?.toLowerCase() === email.toLowerCase())

    let userId: string

    if (existingUser) {
      userId = existingUser.id
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (createErr) return new Response(createErr.message, { status: 500 })
      const newUserId = (created as { user: { id: string } | null })?.user?.id
      if (!newUserId) return new Response('User creation returned no id', { status: 500 })
      userId = newUserId
    }

    // Upsert competition membership
    await db
      .insert(competitionAdmin)
      .values({ userId, competitionId: competition.id, role })
      .onConflictDoUpdate({
        target: [competitionAdmin.userId, competitionAdmin.competitionId],
        set: { role },
      })

    return Response.json({ userId, email, role }, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
