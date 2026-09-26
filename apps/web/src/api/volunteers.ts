import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { queryKeys } from './queryKeys'
import type { VolunteerRole } from './volunteerRoles'

// GET /api/volunteers, the other roster. Read by the people screen to edit it
// and by the workout screen to offer a judge for a lane — one read, one shape,
// as with the athletes beside it.

export type Volunteer = {
  id: number
  name: string
  roleId: number | null
  role: VolunteerRole | null
}

export const volunteersOptions = (slug: string) => ({
  queryKey: queryKeys.volunteers(slug),
  queryFn: () => apiGet<Volunteer[]>(`/api/volunteers?slug=${slug}`),
  enabled: !!slug,
})

export function useVolunteers(slug: string) {
  return useQuery(volunteersOptions(slug))
}
