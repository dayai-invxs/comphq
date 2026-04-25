import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { setting } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'

async function getSetting(competitionId: number, key: string, defaultValue: string): Promise<string> {
  const rows = await db
    .select({ value: setting.value })
    .from(setting)
    .where(and(eq(setting.competitionId, competitionId), eq(setting.key, key)))
    .limit(1)
  return rows[0]?.value ?? defaultValue
}

async function upsertSetting(competitionId: number, key: string, value: string) {
  await db
    .insert(setting)
    .values({ competitionId, key, value })
    .onConflictDoUpdate({ target: [setting.competitionId, setting.key], set: { value } })
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const [athleteChecksRaw, equipChecksRaw] = await Promise.all([
    getSetting(competition.id, 'athleteChecks', '{}'),
    getSetting(competition.id, 'equipChecks', '{}'),
  ])

  let athleteChecks = {}
  let equipChecks = {}
  try { athleteChecks = JSON.parse(athleteChecksRaw) } catch { /* use default */ }
  try { equipChecks = JSON.parse(equipChecksRaw) } catch { /* use default */ }

  return Response.json({ athleteChecks, equipChecks })
}

const ChecksPatch = z.object({
  slug: z.string().min(1),
  type: z.enum(['athlete', 'equipment']),
  checks: z.record(z.string(), z.unknown()),
})

export async function PATCH(req: Request) {
  let body: unknown
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  const parsed = ChecksPatch.safeParse(body)
  if (!parsed.success) return new Response('Invalid request', { status: 400 })

  const { slug, type, checks } = parsed.data
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const key = type === 'athlete' ? 'athleteChecks' : 'equipChecks'
  await upsertSetting(competition.id, key, JSON.stringify(checks))

  return new Response(null, { status: 204 })
}
