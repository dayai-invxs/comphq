import { calcHeatStartMs, fmtHeatTime } from '@/lib/heatTime'
import { pickVersion, type ScoreCardSpec } from '@/lib/scoreCard'
import type { Assignment, Workout } from '@/features/workout-detail/useWorkoutDetail'
import type { Gender } from './boxes'

// Which cards a print run makes, and what each one says about who is on it.
// The card's movements come from the workout's structure; everything here
// comes from CompHQ's own records, so a card can't disagree with the heats.

export type Person = { name: string; gender: Gender | null }

/** Who a card is for. Every field null on a blank card: a line to write on. */
export type Entrant = {
  /** The athlete, the team, or (split team) the member running this lane. */
  name: string | null
  /** The team a split-team member's card belongs to. */
  team: string | null
  division: string | null
  bib: string | null
  /** An individual's gender, or the member's on a split-team card. */
  gender: Gender | null
  /** A team card's roster; null for an individual or one member's card. */
  roster: Person[] | null
}

export type CardData = {
  key: string
  heat: number | null
  lane: number | null
  /** The heat's start, "9:42 AM"; never on a blank card. */
  start: string | null
  entrant: Entrant
  blank: boolean
  /** Index into spec.versions; 0 when there is no structure. */
  version: number
  /** A knockout consolation lane: the round's card, marked so nobody reads it as advancing. */
  consolation: boolean
  /** Where the QR code goes: the heat, or the workout for a blank card. */
  qr: string
}

const toGender = (g: string | null | undefined): Gender | null =>
  g === 'male' ? 'm' : g === 'female' ? 'f' : null

export const workoutUrl = (origin: string, slug: string, workoutId: number) =>
  `${origin}/${slug}/admin/workouts/${workoutId}`

type Options = {
  slug: string
  origin: string
  /** The competition's "Show bib" setting: off, no card has a bib box. */
  showBib: boolean
  /** Only these heats; all of them when absent. */
  heats?: number[]
  /** Every card from this version, instead of each lane's own (a round's
      second card, e.g. single-unders in place of double-unders). */
  version?: number
}

/**
 * One card per lane, in heat and lane order. A team placed in more than one
 * heat (a split team) runs one member per lane, so its card is that member's,
 * under the team's name. A knockout lane's card is its round's version.
 */
export function laneCards(workout: Workout, spec: ScoreCardSpec | null, opts: Options): CardData[] {
  const heatsOf = new Map<number, Set<number>>()
  for (const a of workout.assignments) heatsOf.set(a.athlete.id, (heatsOf.get(a.athlete.id) ?? new Set()).add(a.heatNumber))
  const split = (a: Assignment) => !workout.knockout && (heatsOf.get(a.athlete.id)?.size ?? 0) > 1

  return workout.assignments
    .filter((a) => !opts.heats || opts.heats.includes(a.heatNumber))
    .sort((x, y) => x.heatNumber - y.heatNumber || x.lane - y.lane)
    .map((a) => {
      const members = a.athlete.memberList ?? []
      const bib = opts.showBib ? a.athlete.bibNumber ?? null : null
      const division = a.athlete.division?.name ?? null
      let entrant: Entrant
      if (split(a)) {
        const m = members.find((x) => x.id === a.teamMemberId)
        entrant = { name: m?.name ?? null, team: a.athlete.name, division, bib, gender: toGender(m?.gender), roster: null }
      } else if (members.length > 0) {
        entrant = {
          name: a.athlete.name, team: null, division, bib, gender: null,
          roster: members.map((m) => ({ name: m.name, gender: toGender(m.gender) })),
        }
      } else {
        entrant = { name: a.athlete.name, team: null, division, bib, gender: toGender(a.athlete.gender), roster: null }
      }
      const start = workout.startTime
        ? fmtHeatTime(calcHeatStartMs(a.heatNumber, workout.startTime, workout.heatIntervalSecs, workout.heatStartOverrides, workout.timeBetweenHeatsSecs))
        : null
      return {
        key: `lane-${a.id}`,
        heat: a.heatNumber,
        lane: a.lane,
        start,
        entrant,
        blank: false,
        version: !spec ? 0 : opts.version ?? pickVersion(spec, { divisionName: division, round: a.round }),
        consolation: !!a.consolation,
        qr: `${workoutUrl(opts.origin, opts.slug, workout.id)}#heat-${a.heatNumber}`,
      }
    })
}

/**
 * Cards printed before anyone is placed — a knockout round, or a workout the
 * leaderboard seeds later. Name, division, heat and lane are lines to write
 * on, there is no start time, and the QR opens the workout.
 */
export function blankCards(
  workout: Pick<Workout, 'id'>,
  spec: ScoreCardSpec | null,
  opts: { slug: string; origin: string; count: number; version: number },
): CardData[] {
  const teamCard = !!spec?.team && spec.cardsPer !== 'athlete'
  const roster = teamCard ? Array.from({ length: spec!.team!.size }, () => ({ name: '', gender: null })) : null
  return Array.from({ length: Math.max(0, opts.count) }, (_, i) => ({
    key: `blank-${i}`,
    heat: null,
    lane: null,
    start: null,
    entrant: {
      name: null,
      // One member's card of a team still has a line for the team.
      team: spec?.team && spec.cardsPer === 'athlete' ? '' : null,
      division: null, bib: null, gender: null, roster,
    },
    blank: true,
    version: opts.version,
    consolation: false,
    qr: workoutUrl(opts.origin, opts.slug, workout.id),
  }))
}

/** Cards to a letter sheet: two, cut in half, or one, enlarged to fill it. */
export function sheets<T>(cards: T[], perSheet: 1 | 2 = 2): T[][] {
  const out: T[][] = []
  for (let i = 0; i < cards.length; i += perSheet) out.push(cards.slice(i, i + perSheet))
  return out
}
