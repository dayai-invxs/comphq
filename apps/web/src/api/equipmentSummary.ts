import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { queryKeys } from './queryKeys'

// Every item any workout asks for, counted the way the competition has to buy
// them: the most needed at once, never the sum (quirk, locked in v1's own
// equipment-summary spec).

export type EquipmentBreakdown = {
  workoutId: number
  workoutNumber: number
  workoutName: string
  divisionNames: (string | null)[]
  maxCount: number
}

export type EquipmentSummaryItem = {
  item: string
  maxCount: number
  breakdown: EquipmentBreakdown[]
}

/** Held behind `enabled` because v1 put it behind a Load button — the walk
    across every workout's equipment is not what the screen is for. */
export function useEquipmentSummary(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.equipmentSummary(slug),
    queryFn: async () => (await apiGet<{ items: EquipmentSummaryItem[] }>(`/api/equipment-summary?slug=${slug}`)).items,
    enabled: enabled && !!slug,
  })
}
