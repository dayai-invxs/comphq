import { z } from 'zod'

// A printable judge's score card, described as data. One structure per
// workout (Workout.scoreCard) draws every card the workout prints: a lane's,
// a blank one, or the preview in the editor. It is written by hand today, by
// an AI later; either way it is checked against this schema before it is
// saved, and the web app draws only what passes.
//
// What the structure does NOT hold: the athlete, heat, lane, start time, score
// type, tiebreak or Part B. Those come from CompHQ when a card is printed, so a
// card can never disagree with how the workout is scored.
//
// The rules the structure encodes (settled with the organizer):
//  - machines (row, bike, ski) get one box for the whole movement, and a
//    calorie counts as one rep; capped partway, the judge writes the number
//    reached in that box
//  - a distance movement gets one box per rep, its rep size from the
//    description (repDefinitions) — or asked for, and printing waits
//  - each box shows that movement's own count, with the running total small
//    beneath: the whole workout in a chipper, the current round in an AMRAP
//  - boxes go one per rep up to 10, then in 5s, then in 10s once 5s would pass
//    10 boxes (groupSize)
//  - an AMRAP prints the estimated most rounds anyone completes, plus one

const Text = z.string().trim().max(300)
const Name = z.string().trim().min(1).max(120)

/** Men's and women's numbers. Equal when the workout doesn't split them. */
const MF = z.object({ m: z.number().nonnegative().max(100_000), f: z.number().nonnegative().max(100_000) })

const LevelSwap = z.object({ movement: Name.optional(), amount: MF.optional() })

export const ScoreCardItem = z.object({
  movement: Name,
  /** Rx numbers; the Int and Sc swaps are in `levels`. Absent for a write-in. */
  amount: MF.optional(),
  /** Added each round of a ladder. */
  step: MF.optional(),
  unit: z.enum(['reps', 'cal', 'ft', 'm', 'lines']).optional(),
  /** reps: boxes in groups · whole: one box for the movement · entry: write-ins · lines: a box per suicide line */
  box: z.enum(['reps', 'whole', 'entry', 'lines']),
  /** Key into repDefinitions: what one rep of this movement is. */
  repDef: z.string().trim().min(1).max(40).optional(),
  /** Overrides the default box size. */
  groupBy: z.number().int().positive().max(100).optional(),
  load: z.object({ m: Text, f: Text }).optional(),
  /** A TB box beside this movement: the clock time it was finished. */
  tiebreakMark: z.boolean().optional(),
  levels: z.object({ Int: LevelSwap.optional(), Sc: LevelSwap.optional() }).optional(),
  /** A short line under the movement name. */
  note: Text.optional(),
  /** Suicide lines in order; 0 is back at the start. */
  lines: z.array(z.number().nonnegative().max(1000)).min(1).max(30).optional(),
  /** A distance counts only in full sets of this many feet (16 ft HS walk = 2 reps). */
  setFt: z.number().positive().max(1000).optional(),
  /**
   * What each counted rep is worth toward the score, when it isn't 1: 0.5 for
   * single-unders done in place of double-unders (2 singles = 1 rep). The boxes
   * count what the athlete does; the grey total counts what it scores, so the
   * judge never converts.
   */
  scoreEach: z.number().positive().max(100).optional(),
  /** Write-in boxes, multiplied together when `product` is set (lb × reps). */
  entry: z.array(z.enum(['lb', 'kg', 'reps'])).min(1).max(3).optional(),
  product: z.boolean().optional(),
})

const Items = z.array(ScoreCardItem).min(1).max(40)
const Title = Text.optional()

/** One athlete's turn in a relay, when each level does something different. */
export const ScoreCardLeg = z.object({
  /** "RX athlete" — who runs this block, whatever the tag order. */
  label: Name,
  /** That athlete's load, e.g. "KBs 53/35 lb". */
  load: Text.optional(),
  items: Items,
})

export const ScoreCardPart = z.discriminatedUnion('kind', [
  /** For time / chipper: the grey total runs through the whole workout. */
  z.object({ kind: z.literal('sequence'), title: Title, items: Items }),
  /** AMRAP whose sets grow each round; prints version.estimatedRounds + 1 rounds. */
  z.object({ kind: z.literal('ladder'), title: Title, items: Items }),
  /** A lift log: attempts, best `count` added. */
  z.object({
    kind: z.literal('lift'), title: Title, lift: Name,
    count: z.number().int().min(1).max(10), attempts: z.number().int().min(1).max(30),
  }),
  /** Timed windows rotating through the team (A → B → C), one row each. */
  z.object({
    kind: z.literal('windows'), title: Title,
    windowSecs: z.number().int().min(10).max(3600),
    rotation: z.array(z.string().trim().min(1).max(4)).min(1).max(12),
    perAthlete: z.number().int().min(1).max(20),
    items: Items,
  }),
  /** Every minute, the reps grow by `step`; prints estimatedMinutes + 1 minutes. */
  z.object({
    kind: z.literal('emom'), title: Title,
    startReps: z.number().int().min(1).max(100), step: z.number().int().min(0).max(20),
    estimatedMinutes: z.number().int().min(1).max(40),
    items: z.array(ScoreCardItem).min(1).max(3),
  }),
  /**
   * Each team member does the items in turn, then tags the next. With `legs`,
   * each level has its own block instead (one Rx, one Int, one Sc athlete per
   * team), and the grey total always restarts per athlete since the tag order
   * isn't known when the card prints.
   */
  z.object({
    kind: z.literal('relay'), title: Title, items: Items.optional(),
    legs: z.array(ScoreCardLeg).min(1).max(12).optional(),
    tag: Text.optional(),
    /** Restart the grey total for each athlete (legs differ by gender or level). */
    resetTotalEachAthlete: z.boolean().optional(),
  }),
])

export const ScoreCardVersion = z.object({
  /** "RX", "Scaled", "Round 2" — as the description names it. */
  label: Name,
  /** CompHQ division names this version is for. Empty: any division. */
  divisions: z.array(Name).max(50).optional(),
  /** A knockout round this version is for. */
  round: z.number().int().min(1).max(10).optional(),
  /** A heading over the parts, e.g. "Round 2 · cap 5:00". Never who advances: see advancementText. */
  stage: Text.optional(),
  /** Overrides the workout's cap for this version ("5:00"). */
  cap: Text.optional(),
  loads: z.union([z.array(Text).max(10), z.object({ m: z.array(Text).max(10), f: z.array(Text).max(10) })]).optional(),
  /** AMRAP: the most rounds anyone should complete; one more is printed. */
  estimatedRounds: z.number().int().min(1).max(60).optional(),
  tiebreak: Text.nullable().optional(),
  /** Judge reminders for this version's cards only, printed before the workout's. */
  notes: z.array(Text).max(6).optional(),
  parts: z.array(ScoreCardPart).min(1).max(6),
})

export const ScoreCardRepDefinition = z.object({
  key: z.string().trim().min(1).max(40),
  movement: Name,
  /** distancePerRep: feet in one rep · repsPerItem: reps one run is worth · repsPerLine: reps each suicide line is worth */
  kind: z.enum(['distancePerRep', 'repsPerItem', 'repsPerLine']),
  /** null: the description doesn't say. Asked on the preview, and printing waits. */
  value: z.number().positive().max(10_000).nullable(),
  question: Text.optional(),
  source: z.enum(['description', 'organizer']).nullable().optional(),
})

export const ScoreCardSpec = z.object({
  version: z.literal(1),
  /** The time cap as written ("20:00", "none"). */
  cap: Text.optional(),
  /** athlete: one card per team member, each in their own heat. */
  cardsPer: z.enum(['lane', 'athlete']).optional(),
  team: z.object({
    size: z.number().int().min(2).max(12),
    /** perAthlete: each member marks Rx / Int / Sc on the card. */
    levelChoice: z.enum(['division', 'perAthlete']),
    /** letters: A, B, C rotation · numbers: relay order · absent: no order. */
    order: z.enum(['letters', 'numbers']).nullable().optional(),
    format: Text.optional(),
  }).optional(),
  repDefinitions: z.array(ScoreCardRepDefinition).max(20).optional(),
  versions: z.array(ScoreCardVersion).min(1).max(12),
  /** Short judge reminders printed on the card. Never the full description. */
  notes: z.array(Text).max(10).optional(),
  /** Things to check, shown in the editor only. */
  warnings: z.array(Text).max(30).optional(),
}).superRefine((spec, ctx) => {
  const keys = new Set((spec.repDefinitions ?? []).map((d) => d.key))
  spec.versions.forEach((v, vi) => v.parts.forEach((p, pi) => {
    const at = ['versions', vi, 'parts', pi]
    if (p.kind === 'relay' && !p.items && !p.legs) {
      ctx.addIssue({ code: 'custom', path: [...at, 'items'], message: 'a relay needs items or legs' })
    }
    const lists: [ScoreCardItem[], (string | number)[]][] = p.kind === 'lift' ? [] : [
      ...('items' in p && p.items ? [[p.items, [...at, 'items']] as [ScoreCardItem[], (string | number)[]]] : []),
      ...(p.kind === 'relay' ? (p.legs ?? []).map((l, li) => [l.items, [...at, 'legs', li, 'items']] as [ScoreCardItem[], (string | number)[]]) : []),
    ]
    for (const [items, path] of lists) items.forEach((item, ii) => {
      if (item.repDef && !keys.has(item.repDef)) {
        ctx.addIssue({ code: 'custom', path: [...path, ii, 'repDef'], message: `"${item.repDef}" is not one of the repDefinitions` })
      }
      if (item.box === 'lines' && !item.lines) {
        ctx.addIssue({ code: 'custom', path: [...path, ii, 'lines'], message: 'a lines box needs its lines' })
      }
      if ((item.box === 'reps' || item.box === 'whole') && !item.amount && p.kind !== 'emom') {
        ctx.addIssue({ code: 'custom', path: [...path, ii, 'amount'], message: 'needs an amount' })
      }
    })
  }))
})

export type ScoreCardSpec = z.infer<typeof ScoreCardSpec>
export type ScoreCardVersion = z.infer<typeof ScoreCardVersion>
export type ScoreCardPart = z.infer<typeof ScoreCardPart>
export type ScoreCardItem = z.infer<typeof ScoreCardItem>
export type ScoreCardRepDefinition = z.infer<typeof ScoreCardRepDefinition>
export type ScoreCardLeg = z.infer<typeof ScoreCardLeg>

/** Every movement in a part: its items, and each relay leg's. */
export function partItems(part: ScoreCardPart): ScoreCardItem[] {
  if (part.kind === 'lift') return []
  return [...(part.items ?? []), ...(part.kind === 'relay' ? (part.legs ?? []).flatMap((l) => l.items) : [])]
}

export type ParsedScoreCard = { ok: true; spec: ScoreCardSpec } | { ok: false; errors: string[] }

/** Checks a structure, with errors a person can act on ("versions.0.parts.1.items.2.amount: needs an amount"). */
export function parseScoreCard(input: unknown): ParsedScoreCard {
  const r = ScoreCardSpec.safeParse(input)
  if (r.success) return { ok: true, spec: r.data }
  return {
    ok: false,
    errors: r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)),
  }
}

// Who goes through is CompHQ's knockout setting, not the card's: a round's
// consolation heats run the same card, so "top 3 only" would be wrong on half
// of them. Printed text can't say it; the editor won't save a structure that does.
const ADVANCES = /\btop\s*\d+\b|\badvanc|\bqualif|\bmoves? on\b|\beliminat/i

/** Printed text that says who advances, as "versions.2.stage: Round 2 · top 3 only". */
export function advancementText(spec: ScoreCardSpec): string[] {
  const out: string[] = []
  const look = (path: string, text: string | null | undefined) => {
    if (text && ADVANCES.test(text)) out.push(`${path}: ${text}`)
  }
  spec.notes?.forEach((n, i) => look(`notes.${i}`, n))
  spec.versions.forEach((v, vi) => {
    const at = `versions.${vi}`
    look(`${at}.label`, v.label)
    look(`${at}.stage`, v.stage)
    look(`${at}.tiebreak`, v.tiebreak)
    v.notes?.forEach((n, i) => look(`${at}.notes.${i}`, n))
    v.parts.forEach((p, pi) => {
      look(`${at}.parts.${pi}.title`, p.title)
      if (p.kind === 'relay') look(`${at}.parts.${pi}.tag`, p.tag)
    })
  })
  return out
}

/** Rep definitions nobody has answered yet. A card that needs one can't print. */
export function unansweredRepDefinitions(spec: ScoreCardSpec): ScoreCardRepDefinition[] {
  return (spec.repDefinitions ?? []).filter((d) => d.value == null)
}

/**
 * The version a lane's card is drawn from: the knockout round's (the first, if
 * a round has more than one card — the print page picks the others), else the one
 * naming the lane's division, else one that names no division, else the first.
 * Division names compare without case or surrounding space.
 */
export function pickVersion(
  spec: ScoreCardSpec,
  lane: { divisionName?: string | null; round?: number | null },
): number {
  const byRound = spec.versions.findIndex((v) => v.round != null && v.round === (lane.round ?? 1))
  if (byRound >= 0) return byRound
  const norm = (s: string) => s.trim().toLowerCase()
  if (lane.divisionName) {
    const want = norm(lane.divisionName)
    const named = spec.versions.findIndex((v) => (v.divisions ?? []).some((d) => norm(d) === want))
    if (named >= 0) return named
  }
  const open = spec.versions.findIndex((v) => !v.divisions?.length && v.round == null)
  return open >= 0 ? open : 0
}
