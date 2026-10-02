import type { ScoreTypeValue } from '../workoutEnums'
import { zonedTimeToIso } from '../datetime'
import { calcHeatStartMs } from '../heatTime'
import type { CcEvent, CcHeat, CcWorkout } from './client'

/**
 * Pure translation of a Competition Corner event into the rows comphq would
 * hold for it. No database, no network: the diff and the routes build on this.
 *
 * Ids from the source become `externalId` strings so a later sync can match
 * rows that were renamed.
 */

export type PlanDivision = { externalId: string; name: string; order: number }

export type PlanAthlete = { externalId: string; name: string; divisionExternalId: string | null }

export type PlanWorkout = {
  externalId: string
  externalPartBId: string | null
  number: number
  name: string
  description: string | null
  /** Null when the source type has no match; the admin picks one. */
  scoreType: ScoreTypeValue | null
  tiebreakEnabled: boolean
  tiebreakScoreType: ScoreTypeValue
  partBEnabled: boolean
  partBScoreType: ScoreTypeValue
  lanes: number
  startTime: string | null
  heatIntervalSecs: number
  timeBetweenHeatsSecs: number
  heatStartOverrides: Record<string, string>
  /** Location name; the apply step finds or creates the WorkoutLocation. */
  location: string | null
  warnings: string[]
}

export type PlanHeat = {
  workoutExternalId: string
  heatNumber: number
  startTime: string | null
  lanes: Array<{ lane: number; athleteExternalId: string }>
}

export type ImportPlan = {
  divisions: PlanDivision[]
  workouts: PlanWorkout[]
  athletes: PlanAthlete[]
  heats: PlanHeat[]
}

export type MapOptions = {
  /** IANA zone the source's wall-clock times are in. */
  tz: string
  /** Join "(Part A)" / "(Part B)" pairs into one workout with Part B on. */
  mergePartB: boolean
}

const MAX_LANES = 20
const MAX_NAME = 120
const MAX_DESCRIPTION = 5000
const DEFAULT_INTERVAL_SECS = 600

const SCORE_TYPES: Record<string, ScoreTypeValue> = {
  amrap: 'rounds_reps',
  time: 'time',
  repmax: 'weight',
}

export function mapScoreType(ccType: string): ScoreTypeValue | null {
  return SCORE_TYPES[ccType] ?? null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Workout descriptions arrive as a full HTML document; keep the words and line breaks. */
export function htmlToText(html: string | null): string | null {
  if (!html) return null
  const text = html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .split('\n').map((l) => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || null
}

const PART = /\s*\(Part ([AB])\)\s*$/i

function partOf(name: string): 'A' | 'B' | null {
  const m = PART.exec(name)
  return m ? (m[1].toUpperCase() as 'A' | 'B') : null
}

/** "Foo - WOD 3 (Part A)" and "Foo (Part B)" both reduce to "foo". */
function baseName(name: string): string {
  return name.replace(PART, '').replace(/\s*-\s*WOD\s*\d+\s*$/i, '').trim().toLowerCase()
}

function capSecs(timeCap: string | null): number | null {
  const m = timeCap ? /^(\d+):(\d{2}):(\d{2})$/.exec(timeCap) : null
  const secs = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0
  return secs > 0 ? secs : null
}

/** Heats of one workout, numbered: by title when every title has one, else by time. */
function numberHeats(heats: CcHeat[]): Array<{ heat: CcHeat; number: number }> {
  const numbers = heats.map((h) => Number(/Heat\s+(\d+)/i.exec(h.title)?.[1] ?? NaN))
  if (numbers.every((n) => Number.isInteger(n) && n > 0)) {
    return heats.map((heat, i) => ({ heat, number: numbers[i] })).sort((a, b) => a.number - b.number)
  }
  return [...heats].sort((a, b) => a.time.localeCompare(b.time)).map((heat, i) => ({ heat, number: i + 1 }))
}

/** The most common gap between consecutive heats; ties go to the shorter. */
function commonGapSecs(startsMs: number[]): number | null {
  const counts = new Map<number, number>()
  for (let i = 1; i < startsMs.length; i++) {
    const gap = (startsMs[i] - startsMs[i - 1]) / 1000
    if (gap > 0) counts.set(gap, (counts.get(gap) ?? 0) + 1)
  }
  let best: number | null = null
  for (const [gap, n] of counts) {
    const bestN = best == null ? 0 : counts.get(best)!
    if (n > bestN || (n === bestN && gap < best!)) best = gap
  }
  return best
}

type Timing = Pick<PlanWorkout, 'startTime' | 'heatIntervalSecs' | 'timeBetweenHeatsSecs' | 'heatStartOverrides'>

/**
 * Fit comphq's "start + N × (interval + gap)" model to the source times.
 * The time cap, when it fits the rhythm, is the interval and the rest is the
 * gap. Any heat the rhythm misses becomes an override, which re-anchors the
 * heats after it.
 */
function fitTiming(heats: PlanHeat[], cap: number | null): Timing {
  const timed = heats.filter((h) => h.startTime)
  const startsMs = timed.map((h) => Date.parse(h.startTime!))
  const pace = commonGapSecs(startsMs) ?? cap ?? DEFAULT_INTERVAL_SECS
  const heatIntervalSecs = cap != null && cap <= pace ? cap : pace
  const timeBetweenHeatsSecs = pace - heatIntervalSecs
  const startTime = timed[0]?.startTime ?? null

  const heatStartOverrides: Record<string, string> = {}
  timed.forEach((h, i) => {
    const expected = calcHeatStartMs(h.heatNumber, startTime, heatIntervalSecs, heatStartOverrides, timeBetweenHeatsSecs)
    if (expected !== startsMs[i]) heatStartOverrides[h.heatNumber] = h.startTime!
  })

  return { startTime, heatIntervalSecs, timeBetweenHeatsSecs, heatStartOverrides }
}

function mapHeats(workout: CcWorkout, heats: CcHeat[], tz: string): PlanHeat[] {
  const day = workout.date.slice(0, 10)
  return numberHeats(heats).map(({ heat, number }) => ({
    workoutExternalId: String(workout.id),
    heatNumber: number,
    startTime: zonedTimeToIso(day, heat.time, tz),
    lanes: heat.stations
      .map((s) => ({ lane: s.station, athleteExternalId: String(s.participantId) }))
      .sort((a, b) => a.lane - b.lane),
  }))
}

/** Part B id for each Part A it joins, matched by base name, then by date and first heat time. */
function pairParts(workouts: CcWorkout[], firstHeat: Map<number, string>): Map<number, CcWorkout> {
  const pairs = new Map<number, CcWorkout>()
  const partAs = workouts.filter((w) => partOf(w.name) === 'A')
  const slot = (w: CcWorkout) => `${w.date}|${firstHeat.get(w.id) ?? ''}`
  for (const b of workouts.filter((w) => partOf(w.name) === 'B')) {
    const free = partAs.filter((a) => !pairs.has(a.id))
    const a = free.find((x) => baseName(x.name) === baseName(b.name))
      ?? free.find((x) => firstHeat.has(x.id) && slot(x) === slot(b))
    if (a) pairs.set(a.id, b)
  }
  return pairs
}

export function mapEvent(ev: CcEvent, { tz, mergePartB }: MapOptions): ImportPlan {
  const divisions = ev.divisions.map((d, i) => ({ externalId: String(d.id), name: d.title, order: i + 1 }))

  const athletes = new Map<string, PlanAthlete>()
  for (const s of ev.heats.flatMap((h) => h.stations)) {
    const id = String(s.participantId)
    if (!athletes.has(id)) athletes.set(id, { externalId: id, name: s.participantName, divisionExternalId: String(s.divisionId) })
  }

  const heatsByWorkout = new Map<number, CcHeat[]>()
  for (const h of ev.heats) heatsByWorkout.set(h.workoutId, [...(heatsByWorkout.get(h.workoutId) ?? []), h])
  const firstHeat = new Map(
    [...heatsByWorkout].map(([id, hs]) => [id, hs.map((h) => h.time).sort()[0]]),
  )
  const pairs = mergePartB ? pairParts(ev.workouts, firstHeat) : new Map<number, CcWorkout>()
  const joinedB = new Set([...pairs.values()].map((b) => b.id))

  const ordered = ev.workouts
    .filter((w) => !joinedB.has(w.id))
    .sort((a, b) => `${a.date}|${firstHeat.get(a.id) ?? '99:99'}`.localeCompare(`${b.date}|${firstHeat.get(b.id) ?? '99:99'}`))

  const workouts: PlanWorkout[] = []
  const heats: PlanHeat[] = []

  ordered.forEach((w, i) => {
    const warnings: string[] = []
    const partB = pairs.get(w.id) ?? null
    if (mergePartB && !partB && partOf(w.name) === 'B') warnings.push('Part B with no matching Part A; imported on its own.')

    const scoreType = mapScoreType(w.type)
    if (!scoreType) warnings.push(`Score type "${w.type}" has no match here. Pick one.`)

    // A merged pair's source tiebreak just points at the other part, which Part B scoring covers.
    const tiebreakScoreType = partB ? null : w.tiebreakerType ? mapScoreType(w.tiebreakerType) : null
    if (!partB && w.tiebreakerType && !tiebreakScoreType) {
      warnings.push(`Tiebreak type "${w.tiebreakerType}" has no match here. Tiebreak left off.`)
    }

    const partBScoreType = partB ? mapScoreType(partB.type) : null
    if (partB && !partBScoreType) warnings.push(`Part B score type "${partB.type}" has no match here. Defaulted to time.`)

    const wHeats = mapHeats(w, heatsByWorkout.get(w.id) ?? [], tz)
    const sourceLanes = Math.max(1, ...(heatsByWorkout.get(w.id) ?? []).flatMap((h) => [h.size, ...h.stations.map((s) => s.station)]))
    if (sourceLanes > MAX_LANES) warnings.push(`Source has ${sourceLanes} lanes; the limit here is ${MAX_LANES}.`)

    const name = partB ? w.name.replace(PART, '') : w.name
    let description = htmlToText(w.description)
    if (description && description.length > MAX_DESCRIPTION) {
      description = description.slice(0, MAX_DESCRIPTION)
      warnings.push(`Description cut to ${MAX_DESCRIPTION} characters.`)
    }

    workouts.push({
      externalId: String(w.id),
      externalPartBId: partB ? String(partB.id) : null,
      number: i + 1,
      name: name.slice(0, MAX_NAME),
      description,
      scoreType,
      tiebreakEnabled: tiebreakScoreType != null,
      tiebreakScoreType: tiebreakScoreType ?? 'time',
      partBEnabled: partB != null,
      partBScoreType: partBScoreType ?? 'time',
      lanes: Math.min(sourceLanes, MAX_LANES),
      ...fitTiming(wHeats, capSecs(w.timeCap)),
      location: w.location,
      warnings,
    })
    heats.push(...wHeats)
  })

  return { divisions, workouts, athletes: [...athletes.values()], heats }
}
