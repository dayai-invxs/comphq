import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { setting } from '@/db/schema'
import { SCORING_SETTING_KEYS, scoringFromSettings, type Scoring } from '@/lib/pointsScale'

/** A competition's scoring system and points scale, in one read. */
export async function loadScoring(competitionId: number): Promise<Scoring> {
  const rows = await db
    .select({ key: setting.key, value: setting.value })
    .from(setting)
    .where(and(eq(setting.competitionId, competitionId), inArray(setting.key, [...SCORING_SETTING_KEYS])))
  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  return scoringFromSettings((key) => byKey.get(key))
}
