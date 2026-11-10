import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiGet } from '@/lib/api'

export interface EquipmentItem {
  id: number
  item: string
  divisionId: number | null
  division: { id: number; name: string } | null
}

// GET /api/schedule/equipment: every workout's list in one read. This screen
// used to ask once per workout, and on a phone at a venue each of those asks
// was a trip of its own. Public, like the rest of /api/schedule, which is what
// lets this screen (behind a shared password rather than a sign-in) read it.
// An unannounced secret workout has no list here, so it shows none.
export function useWorkoutEquipment(slug: string) {
  const { data } = useQuery({
    queryKey: queryKeys.scheduleEquipment(slug),
    queryFn: () => apiGet<{ byWorkout: Record<number, EquipmentItem[]> }>(`/api/schedule/equipment?slug=${slug}`),
    enabled: !!slug,
  })
  return data?.byWorkout ?? {}
}
