export const ASSIGNMENT_EMBED =
  '*, athlete:Athlete(id, name, bibNumber, divisionId, division:Division(id, name, order))'

export const SCORE_EMBED = '*, athlete:Athlete(id, name, bibNumber, divisionId)'

// What an athlete row reads as on the roster: the row, its division, and the
// team's members if it is a team.
export const ATHLETE_WITH_DIVISION =
  '*, division:Division(id, name, order, teamSize, menCount, womenCount), members:TeamMember(id, name, gender, order)'

type WithMembers = { members?: { id: number; order: number }[] | null }

/** PostgREST returns embedded rows in no promised order; the list is shown in
    the order it was entered. */
export function withSortedMembers<T extends WithMembers>(row: T): T {
  const members = [...(row.members ?? [])].sort((a, b) => a.order - b.order || a.id - b.id)
  return { ...row, members }
}
