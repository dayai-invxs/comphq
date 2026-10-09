import type { DivisionShape } from '@/api/divisions'
import type { Gender } from '@/api/athletes'

// What a division asks of an entry in it, and how an entry falls short. A
// division with teamSize 1 is an individual one; above 1, each entry is a team
// and its members are listed under it. Everything here is advice: a team with
// the wrong number of people, or nobody listed at all, still competes.

export const isTeam = (d: Pick<DivisionShape, 'teamSize'> | null | undefined) => (d?.teamSize ?? 1) > 1

/** "Individual · Female", "Team of 4 · 2M / 2F", "Team of 3". */
export function divisionFormat(d: DivisionShape): string {
  if (!isTeam(d)) {
    if (d.womenCount === 1 && !d.menCount) return 'Individual · Female'
    if (d.menCount === 1 && !d.womenCount) return 'Individual · Male'
    return 'Individual'
  }
  const split = [d.menCount != null && `${d.menCount}M`, d.womenCount != null && `${d.womenCount}F`].filter(Boolean)
  return `Team of ${d.teamSize}${split.length ? ` · ${split.join(' / ')}` : ''}`
}

type Entry = {
  gender: Gender | null
  members: { name: string; gender: Gender | null }[]
}

/** Each way this entry does not match its division, in words an admin can act
    on. Empty when it matches, or when there is no division to match. */
export function entryWarnings(entry: Entry, division: DivisionShape | null | undefined): string[] {
  if (!division) return []
  const out: string[] = []

  if (!isTeam(division)) {
    const want: Gender | null = division.womenCount === 1 && !division.menCount ? 'female'
      : division.menCount === 1 && !division.womenCount ? 'male' : null
    if (want && entry.gender && entry.gender !== want) {
      out.push(`This division is for ${want} athletes.`)
    }
    return out
  }

  const count = entry.members.length
  if (count !== division.teamSize) {
    out.push(`${count} of ${division.teamSize} members listed.`)
  }
  const men = entry.members.filter((m) => m.gender === 'male').length
  const women = entry.members.filter((m) => m.gender === 'female').length
  const unset = entry.members.filter((m) => !m.gender).length
  // Only judged once every listed member has a gender; a blank one could be
  // either, and guessing would warn about teams that are fine.
  if (count > 0 && unset === 0) {
    if (division.menCount != null && men !== division.menCount) out.push(`${men} of ${division.menCount} male.`)
    if (division.womenCount != null && women !== division.womenCount) out.push(`${women} of ${division.womenCount} female.`)
  }
  return out
}

/** Names that appear both on a team and as an individual entry in the same
    competition. Competing both ways is allowed, but more often it is one
    person entered twice, which would put them in heats twice. */
export function doubleEntries(
  athletes: { id: number; name: string; division: Pick<DivisionShape, 'teamSize'> | null; members: { name: string }[] }[],
): Map<number, string[]> {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
  const individuals = new Set(athletes.filter((a) => !isTeam(a.division)).map((a) => norm(a.name)))
  const out = new Map<number, string[]>()
  for (const a of athletes) {
    const dupes = a.members.filter((m) => individuals.has(norm(m.name))).map((m) => m.name)
    if (dupes.length) out.set(a.id, dupes)
  }
  return out
}
