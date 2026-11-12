import type { ScoreCardItem, ScoreCardRepDefinition } from '@/lib/scoreCard'

// The box arithmetic every score card shares: how many boxes a movement gets,
// what each box says, and the running total printed small beneath it. Pure, so
// the rules are tested here rather than read off a printout.

export type Gender = 'm' | 'f'
type MF = { m: number; f: number }

/** One box: the big number (that movement's count, or the line reached) and the grey total under it. */
export type Box = { big: string; total: string | null }

/** One per rep up to 10, then 5s, then 10s once 5s would pass 10 boxes. */
export function groupSize(reps: number, override?: number): number {
  if (override) return override
  if (reps <= 10) return 1
  if (reps / 5 <= 10) return 5
  return 10
}

/** "20/16" when men and women differ, "20" when they don't; one side when the gender is known. */
export function fmtMF(a: MF, g?: Gender | null): string {
  if (g) return String(a[g])
  return a.m === a.f ? String(a.m) : `${a.m}/${a.f}`
}

/** Every level's amount for this round: Rx, then the Int and Sc swaps. */
function amounts(item: ScoreCardItem, round: number): MF[] {
  const at = (a: MF | undefined) => a && {
    m: a.m + (item.step ? item.step.m * (round - 1) : 0),
    f: a.f + (item.step ? item.step.f * (round - 1) : 0),
  }
  return [at(item.amount), at(item.levels?.Int?.amount), at(item.levels?.Sc?.amount)].filter((a): a is MF => !!a)
}

/** The most anyone does — that is how many boxes print. Known gender narrows it. */
export function maxAmount(item: ScoreCardItem, g: Gender | null, round = 1): number {
  const all = amounts(item, round)
  if (all.length === 0) return 0
  return Math.max(...all.map((a) => (g ? a[g] : Math.max(a.m, a.f))))
}

/** Rx amount for this round, as printed beside the movement. */
export function amountLabel(item: ScoreCardItem, g: Gender | null, round = 1): string {
  const [rx] = amounts(item, round)
  if (!rx) return ''
  return `${fmtMF(rx, g)}${item.unit === 'cal' ? ' cal' : item.unit === 'ft' ? ' ft' : item.unit === 'm' ? ' m' : ''}`
}

export type Defs = Record<string, ScoreCardRepDefinition>

/**
 * The boxes for one movement and the running total after it. `total` null
 * means something before it has no rep value yet, so every total after shows
 * "?". `reps` overrides the amount (an EMOM's minute).
 */
export function boxesFor(
  item: ScoreCardItem,
  total: number | null,
  defs: Defs,
  opts: { g?: Gender | null; round?: number; reps?: number; noTotal?: boolean } = {},
): { boxes: Box[]; total: number | null } {
  const g = opts.g ?? null
  const grey = (n: number | null) => (opts.noTotal ? null : total == null || n == null ? '?' : String(total + n))
  const after = (n: number | null) => (total == null || n == null ? null : total + n)

  if (item.box === 'entry') return { boxes: [], total }

  if (item.box === 'whole') {
    // A calorie counts as one rep; a run or distance is worth what its rep
    // definition says, and unknown until someone answers.
    const n = maxAmount(item, g, opts.round)
    const worth = item.unit === 'cal' || item.unit === 'reps' || !item.unit
      ? n
      : item.repDef ? defs[item.repDef]?.value ?? null : null
    return { boxes: [{ big: amountLabel(item, g, opts.round), total: grey(worth) }], total: after(worth) }
  }

  if (item.box === 'lines') {
    const v = item.repDef ? defs[item.repDef]?.value ?? null : null
    const lines = item.lines ?? []
    return {
      boxes: lines.map((l, k) => ({ big: l ? `${l} ft` : 'start', total: grey(v == null ? null : (k + 1) * v) })),
      total: after(v == null ? null : lines.length * v),
    }
  }

  // Reps. A distance counted in reps shows the distance covered in each box
  // (20 ft, 40 ft …) while the grey total still climbs a rep a box — unless it
  // only counts in full sets (16 ft = 2 reps), where each box is one set.
  const n = opts.reps ?? maxAmount(item, g, opts.round)
  const per = item.repDef ? defs[item.repDef]?.value ?? null : null
  const isDistance = item.unit === 'ft' && item.repDef != null
  if (isDistance && per == null) return { boxes: [{ big: 'rep not set', total: grey(null) }], total: null }
  const reps = isDistance && per ? Math.round(n / per) : n
  const size = item.setFt && per
    ? Math.max(1, Math.round(item.setFt / per))
    : isDistance ? 1 : groupSize(reps, item.groupBy)
  const label = (r: number) => (isDistance && per ? `${r * per} ft` : String(r))
  const boxes: Box[] = []
  for (let r = size; r <= reps; r += size) boxes.push({ big: label(r), total: grey(r) })
  if (reps % size) boxes.push({ big: label(reps), total: grey(reps) })
  return { boxes, total: after(reps) }
}

/** "Int: 2/1 Rope Climbs to tape" — the other levels' swaps, for under a movement. */
export function levelSwaps(item: ScoreCardItem, g: Gender | null, round = 1): string[] {
  const out: string[] = []
  for (const lvl of ['Int', 'Sc'] as const) {
    const o = item.levels?.[lvl]
    if (!o) continue
    const a = o.amount
      ? `${fmtMF({ m: o.amount.m + (item.step ? item.step.m * (round - 1) : 0), f: o.amount.f + (item.step ? item.step.f * (round - 1) : 0) }, g)}${item.unit === 'cal' ? ' cal' : ''} `
      : ''
    out.push(`${lvl}: ${a}${o.movement ?? item.movement}`)
  }
  return out
}
