import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { queryKeys } from './queryKeys'

// GET /api/schedule/workouts: what a spectator may read about the workouts.
// Public, drafts left out. The list and the one-workout page read the same
// query, so opening a workout from the list is already loaded.

export interface PublicWorkout {
  id: number
  number: number
  name: string
  description: string | null
  status: string
}

export function usePublicWorkouts(slug: string) {
  return useQuery({
    queryKey: queryKeys.publicWorkouts(slug),
    queryFn: () => apiGet<PublicWorkout[]>(`/api/schedule/workouts?slug=${slug}`),
    enabled: !!slug,
  })
}
