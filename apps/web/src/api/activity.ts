import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { queryKeys } from './queryKeys'

// The competition's audit trail, newest first. Admins only: the server
// refuses anyone else.

/** One change, as the server keeps it: the route it went to and what it carried. */
export type ActivityEntry = {
  id: number
  at: string
  who: string | null
  action: string
  resourceId: string | null
  diff: { params?: Record<string, string>; body?: unknown } | null
}

export type ActivityNames = {
  workouts: { id: number; number: number; name: string; scoreType: string }[]
  athletes: { id: number; name: string }[]
}

export type ActivityData = ActivityNames & { entries: ActivityEntry[] }

export function useActivity(slug: string) {
  return useQuery({
    queryKey: queryKeys.activity(slug),
    queryFn: () => apiGet<ActivityData>(`/api/activity?slug=${slug}`),
    enabled: !!slug,
  })
}
