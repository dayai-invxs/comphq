import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api'
import { queryKeys } from './queryKeys'

// GET /api/workouts, ordered by number. The row is the Workout table's, every
// column of it: the admin screens read most of them and the ones that write
// send the same names back.

export type Workout = {
  id: number
  competitionId: number
  number: number
  name: string
  scoreType: string
  lanes: number
  heatIntervalSecs: number
  timeBetweenHeatsSecs: number
  callTimeSecs: number
  walkoutTimeSecs: number
  startTime: string | null
  status: string
  description: string | null
  mixedHeats: boolean
  tiebreakEnabled: boolean
  tiebreakScoreType: string
  partBEnabled: boolean
  partBScoreType: string
  halfWeight: boolean
  heatStartOverrides: Record<string, string>
  locationId: number | null
}

export const workoutsOptions = (slug: string) => ({
  queryKey: queryKeys.workouts(slug),
  queryFn: () => apiGet<Workout[]>(`/api/workouts?slug=${slug}`),
  enabled: !!slug,
})

export function useWorkouts(slug: string) {
  return useQuery(workoutsOptions(slug))
}

/** The fields the create form fills. Every one of them is sent on every
    create, defaults included, because v1's form has a value in each box. */
export type WorkoutDraft = Omit<Workout, 'id' | 'competitionId' | 'status' | 'heatStartOverrides'>

export function useCreateWorkout(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (draft: WorkoutDraft) => apiPost<Workout>('/api/workouts', { slug, ...draft }),
    meta: { success: 'Workout created' },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workouts(slug) })
      // A workout is a column on the public schedule before it has a heat in
      // it, so the board is stale the moment one is created.
      qc.invalidateQueries({ queryKey: queryKeys.schedule(slug) })
    },
  })
}
