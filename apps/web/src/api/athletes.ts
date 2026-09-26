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

export type AthleteDivision = { id: number; name: string; order: number }

export type Athlete = {
  id: number
  competitionId: number
  name: string
  bibNumber: string | null
  divisionId: number | null
  userId: string | null
  withdrawn: boolean
  division: AthleteDivision | null
}

export const athletesOptions = (slug: string) => ({
  queryKey: queryKeys.athletes(slug),
  queryFn: () => apiGet<Athlete[]>(`/api/athletes?slug=${slug}`),
  enabled: !!slug,
})

export function useAthletes(slug: string) {
  return useQuery(athletesOptions(slug))
}
