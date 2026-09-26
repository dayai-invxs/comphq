import { useQueries } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiGet } from '@/lib/api'

export interface EquipmentItem {
  id: number
  item: string
  divisionId: number | null
  division: { id: number; name: string } | null
}

// GET /api/workouts/[id]/equipment has no session gate (defect 10), which is
// what lets this screen — behind a shared password rather than a sign-in —
// read it at all.
//
// One query per workout, as v1 fetched them: a Promise.all over the workout
// list. A workout whose read fails shows no equipment, which is what v1 did
// with its `r.ok ? r.json() : []`.
export function useWorkoutEquipment(slug: string, workoutIds: number[]) {
  const results = useQueries({
    queries: workoutIds.map((id) => ({
      queryKey: queryKeys.workoutEquipment(slug, id),
      queryFn: () => apiGet<EquipmentItem[]>(`/api/workouts/${id}/equipment?slug=${slug}`),
      enabled: !!slug,
    })),
  })
  const byWorkout: Record<number, EquipmentItem[]> = {}
  workoutIds.forEach((id, i) => {
    byWorkout[id] = results[i]?.data ?? []
  })
  return byWorkout
}
