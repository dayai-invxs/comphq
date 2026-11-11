import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { setting } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'
import { DEFAULT_JUDGE_PASSWORD } from '@/lib/competitionDefaults'

// The judge and equipment screens' password, checked here. It used to be
// read out of the public settings and compared in the browser, so anyone could
// read it. The answer is yes or no; the password itself never leaves.

const JudgeUnlock = z.strictObject({
  slug: z.string().min(1),
  password: z.string().max(200),
})

export async function POST(req: Request) {
  let body: unknown
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }
  const parsed = JudgeUnlock.safeParse(body)
  if (!parsed.success) return new Response('Invalid request', { status: 400 })

  const competition = await resolveCompetition(parsed.data.slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const rows = await db
    .select({ value: setting.value })
    .from(setting)
    .where(and(eq(setting.competitionId, competition.id), eq(setting.key, 'judgePassword')))
    .limit(1)
  const password = rows[0]?.value ?? DEFAULT_JUDGE_PASSWORD

  if (parsed.data.password !== password) return new Response('Incorrect password', { status: 403 })
  return Response.json({ ok: true })
}
