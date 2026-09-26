import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPatch } from '@/lib/api'
import { queryKeys } from './queryKeys'

// The points override behind the admin leaderboard's editable placings.
// PATCH sets points directly and does not re-rank, so the board is re-read
// afterwards rather than patched in place — the placing an organiser types is
// not the standings that follow from it.

type Override = { workoutId: number; athleteId: number; points: number }

export function useSetScorePoints(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ workoutId, athleteId, points }: Override) =>
      apiPatch(`/api/workouts/${workoutId}/scores?slug=${slug}`, { slug, athleteId, points }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.leaderboard(slug) }),
  })
}
