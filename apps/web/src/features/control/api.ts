import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiPut } from '@/lib/api'

/**
 * Moves one heat's start time. Every later heat cascades off it, which is why
 * the heats are read again afterwards rather than patched in place: the answer
 * to "what time is heat 6 now" is the server's.
 *
 * v1 awaited a bare fetch inside a click handler, so a refusal became an
 * unhandled rejection and the editor closed anyway. Here the editor closes on
 * success, which is what leaves a failed save on the screen to be retried.
 */
export function useSetHeatTime(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      workoutId,
      heatNumber,
      isoTime,
    }: {
      workoutId: number
      heatNumber: number
      isoTime: string
    }) => apiPut(`/api/workouts/${workoutId}/heat-times?slug=${slug}`, { heatNumber, isoTime }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.ops(slug) })
    },
  })
}
