import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { queryKeys } from './queryKeys'

// GET /api/athletes, the roster. v1 fetched it straight from four screens —
// the dashboard for a count, people to edit it, workouts to seed heats from,
// workout detail to score against — each with its own useState and its own
// idea of what an athlete looks like. One read, one shape.
//
// The row is the table's, plus the division the API joins on. It requires
// access to the competition, not admin rights: a role='user' member can edit
// the roster (defect 3), and this is one of the endpoints that lets them.

export type Gender = 'male' | 'female'

export type AthleteDivision = {
  id: number; name: string; order: number
  teamSize: number; menCount: number | null; womenCount: number | null
}

/** A person on a team. Members are only listed under their team; the team is
    what takes a lane and gets scored. */
export type TeamMember = { id: number; name: string; gender: Gender | null; order: number }

export type Athlete = {
  id: number
  competitionId: number
  name: string
  bibNumber: string | null
  divisionId: number | null
  userId: string | null
  withdrawn: boolean
  /** An individual's; a team leaves it blank. */
  gender: Gender | null
  division: AthleteDivision | null
  /** Empty for an individual, and for a team with nobody listed yet. */
  members: TeamMember[]
}

export const athletesOptions = (slug: string) => ({
  queryKey: queryKeys.athletes(slug),
  queryFn: () => apiGet<Athlete[]>(`/api/athletes?slug=${slug}`),
  enabled: !!slug,
})

export function useAthletes(slug: string) {
  return useQuery(athletesOptions(slug))
}
