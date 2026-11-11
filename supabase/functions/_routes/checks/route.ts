import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { setting } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'
import { requireCompetitionAccess } from '@/lib/auth-competition'
import { hasJudgeToken } from '@/lib/judgeToken'

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

// One entry merged into the stored map inside the upsert. Postgres locks the
// row for the update, so concurrent ticks each land on the map the one before
// left, instead of overwriting it with the older copy they were built from.
async function mergeSetting(competitionId: number, key: string, entry: string) {
  await db
    .insert(setting)
    .values({ competitionId, key, value: entry })
    .onConflictDoUpdate({
      target: [setting.competitionId, setting.key],
      set: { value: sql`(${setting.value}::jsonb || ${entry}::jsonb)::text` },
    })
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

// Who may tick: the competition's own signed-in people, or a judge or
// equipment station that unlocked its screen with the judge password (it
// carries the token POST /api/settings/judge handed out). This used to take
// writes from anyone who knew the competition's address, and a walk-out tick
// takes a heat off the TV and the schedule.
async function mayTick(req: Request, slug: string, competitionId: number): Promise<boolean> {
  if (await hasJudgeToken(req, competitionId)) return true
  return requireCompetitionAccess(slug).then(() => true, () => false)
}

// The values the two screens write, and nothing else: corral and walk-out
// ticks keyed `${workoutId}-${heatNumber}`, equipment ticks keyed
// `${workoutId}-${heatNumber}-${divisionName}`.
const Key = z.string().min(1).max(200)
const AthleteTick = z.strictObject({ corral: z.boolean(), walkout: z.boolean() })
const EquipTick = z.boolean()
const MAX_KEYS = 5000

const slug = z.string().min(1)
// `checks` replaces the whole map (the reset); `entry` merges one tick.
const ChecksPatch = z.union([
  z.strictObject({ slug, type: z.literal('athlete'), checks: z.record(Key, AthleteTick) }),
  z.strictObject({ slug, type: z.literal('equipment'), checks: z.record(Key, EquipTick) }),
  z.strictObject({ slug, type: z.literal('athlete'), entry: z.strictObject({ key: Key, value: AthleteTick }) }),
  z.strictObject({ slug, type: z.literal('equipment'), entry: z.strictObject({ key: Key, value: EquipTick }) }),
])

export async function PATCH(req: Request) {
  let body: unknown
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  const parsed = ChecksPatch.safeParse(body)
  if (!parsed.success) return new Response('Invalid request', { status: 400 })
  if ('checks' in parsed.data && Object.keys(parsed.data.checks).length > MAX_KEYS) {
    return new Response('Too many checks', { status: 400 })
  }

  const { type } = parsed.data
  const competition = await resolveCompetition(parsed.data.slug)
  if (!competition) return new Response('Competition not found', { status: 404 })
  if (!(await mayTick(req, parsed.data.slug, competition.id))) {
    return new Response('Unlock the judge screen, or sign in, to tick checks', { status: 401 })
  }

  const key = type === 'athlete' ? 'athleteChecks' : 'equipChecks'
  if ('entry' in parsed.data) {
    const { entry } = parsed.data
    await mergeSetting(competition.id, key, JSON.stringify({ [entry.key]: entry.value }))
  } else {
    await upsertSetting(competition.id, key, JSON.stringify(parsed.data.checks))
  }

  return new Response(null, { status: 204 })
}
