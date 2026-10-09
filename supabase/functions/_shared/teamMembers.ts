import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { teamMember } from '@/db/schema'

// A team competes as one Athlete row; the people on it are TeamMember rows
// listed under it. Nothing here places a member in a heat or scores one —
// they are names that ride along with the team wherever the team is shown.

export type MemberRow = { id: number; name: string; gender: string | null; order: number }

const COLUMNS = {
  id: teamMember.id,
  athleteId: teamMember.athleteId,
  name: teamMember.name,
  gender: teamMember.gender,
  order: teamMember.order,
}

/** Members for each of these athletes, in listed order. An athlete with none
    (an individual, or a team nobody has filled in yet) is simply absent. */
export async function membersByAthlete(athleteIds: number[]): Promise<Map<number, MemberRow[]>> {
  const out = new Map<number, MemberRow[]>()
  if (athleteIds.length === 0) return out
  const rows = await db
    .select(COLUMNS)
    .from(teamMember)
    .where(inArray(teamMember.athleteId, athleteIds))
    .orderBy(asc(teamMember.athleteId), asc(teamMember.order), asc(teamMember.id))
  for (const { athleteId, ...m } of rows ?? []) {
    const list = out.get(athleteId) ?? []
    list.push(m)
    out.set(athleteId, list)
  }
  return out
}

/** Members' names for each athlete, for screens that only print them. */
export async function memberNamesByAthlete(athleteIds: number[]): Promise<Map<number, string[]>> {
  const byAthlete = await membersByAthlete(athleteIds)
  return new Map([...byAthlete].map(([id, list]) => [id, list.map((m) => m.name)]))
}

/** Replace a team's member list with this one, in this order. The caller has
    already checked the athlete belongs to the competition. */
export async function replaceTeamMembers(
  athleteId: number,
  members: { name: string; gender?: string | null; externalId?: string | null }[],
): Promise<MemberRow[]> {
  return await db.transaction(async (tx) => {
    await tx.delete(teamMember).where(eq(teamMember.athleteId, athleteId))
    if (members.length === 0) return []
    const rows = await tx
      .insert(teamMember)
      .values(members.map((m, i) => ({
        athleteId,
        name: m.name.trim(),
        gender: m.gender ?? null,
        order: i,
        externalId: m.externalId ?? null,
      })))
      .returning({ id: teamMember.id, name: teamMember.name, gender: teamMember.gender, order: teamMember.order })
    return rows ?? []
  })
}
