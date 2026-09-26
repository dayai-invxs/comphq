import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from '@/lib/api'
import { queryKeys } from './queryKeys'

// GET /api/settings serves the judge password to any caller — no session, no
// gate (defect 1, ported as-is). That is what makes the judge and equipment
// screens' password prompt a courtesy rather than a lock, and it is read here
// exactly as v1 read it.

export interface CompetitionSettings {
  showBib: boolean
  tiebreakWorkoutId: number | null
  leaderboardVisibility: 'per_heat' | 'per_workout'
  tvLeaderboardPercentages: Record<string, number>
  tvLeaderboardOrder: Record<string, number>
  judgePassword?: string
  judgeMaxConsecutive?: number
}

export function useSettings(slug: string) {
  return useQuery({
    queryKey: queryKeys.settings(slug),
    queryFn: () => apiGet<CompetitionSettings>(`/api/settings?slug=${slug}`),
    enabled: !!slug,
  })
}

/** PATCH writes only the keys it is sent, so a caller sends the one that
    changed. `tiebreakWorkoutId: null` is one of those keys, not an omission:
    it clears the designated workout. */
export type SettingsPatch = Partial<Omit<CompetitionSettings, 'tiebreakWorkoutId'>> & {
  tiebreakWorkoutId?: number | null
}

export function useUpdateSettings(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: SettingsPatch) =>
      apiPatch<CompetitionSettings>('/api/settings', { slug, ...patch }),
    meta: { success: 'Setting saved' },
    // A toggle answers the hand, not the network: the patch lands in the cache
    // first and the write follows it out. A refusal puts the old value back —
    // the setup page's banner names the failure, which is also why the own
    // onError here keeps the global toast quiet.
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: queryKeys.settings(slug) })
      const prev = qc.getQueryData<CompetitionSettings>(queryKeys.settings(slug))
      if (prev) qc.setQueryData(queryKeys.settings(slug), { ...prev, ...patch })
      return { prev }
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.settings(slug), ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings(slug) })
      // The designated tiebreak workout and the visibility rule both decide
      // what the board shows, so the board on screen is stale either way.
      qc.invalidateQueries({ queryKey: queryKeys.leaderboard(slug) })
    },
  })
}
