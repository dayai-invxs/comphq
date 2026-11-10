import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut } from '@/lib/api'
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
  /** Off the public Workouts screen until it is active. */
  secret: boolean
  /** A knockout tournament: rounds of heats, top N per heat advance. */
  knockout?: boolean
  knockoutRounds?: number | null
  knockoutAdvance?: number | null
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

/** Activates or deactivates a workout from a list of them (the dashboard).
    The status decides what the public screens show — heats, the TBA line for
    a secret workout, the leaderboard — so they are all re-read. */
export function useSetWorkoutStatus(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'active' | 'draft' }) =>
      apiPut<Workout>(`/api/workouts/${id}?slug=${encodeURIComponent(slug)}`, { status }),
    onSuccess: (_data, { id }) => {
      for (const key of [
        queryKeys.workouts(slug), queryKeys.workout(slug, String(id)), queryKeys.ops(slug),
        queryKeys.schedule(slug), queryKeys.publicWorkouts(slug), queryKeys.leaderboard(slug),
        queryKeys.judgeSchedule(slug), queryKeys.scheduleEquipment(slug),
      ]) qc.invalidateQueries({ queryKey: key })
    },
  })
}
