import { apiDel, apiGet, apiPost, apiPut } from '@/lib/api'
import type { ScorePayload } from './useWorkoutDetail'
import type { AssignmentUpdate } from '@/lib/heat-reorder'

/**
 * Extract-and-test HTTP surface of the workout detail hook. React state
 * lives in the hook; the fetch/validate/parse concerns live here so they
 * can be unit-tested without renderHook machinery.
 *
 * Every mutation throws HttpError on non-OK — callers must catch and
 * surface errors, never swallow them silently (the bug that caused
 * partial scoring in live comps).
 *
 * v1: src/hooks/useWorkoutDetail.mutations.ts. Adapted in one place only —
 * v1's helpers fetch a same-origin `/api/...` path, and v3's handlers are the
 * same files served from another origin behind a gateway, so every call goes
 * through @/lib/api instead. The paths are v1's, character for character; that
 * is the whole point of writing them here rather than re-deriving them.
 */
export function buildWorkoutMutations(workoutId: string, slug: string) {
  const qs = `?slug=${encodeURIComponent(slug)}`
  const base = `/api/workouts/${workoutId}`

  return {
    async load<T>() {
      return apiGet<T>(`${base}${qs}`)
    },

    async saveScorePayload(payload: ScorePayload) {
      return apiPost(`${base}/scores${qs}`, payload)
    },

    /**
     * Save all scores in parallel. If any one fails, the whole batch
     * rejects (Promise.all fail-fast). Callers should surface the error
     * in UI and NOT proceed with downstream steps (e.g. /calculate).
     */
    async saveAll(payloads: ScorePayload[]) {
      await Promise.all(payloads.map((p) => apiPost(`${base}/scores${qs}`, p)))
    },

    async calculate() {
      return apiPost(`${base}/calculate${qs}`, {})
    },

    async completeHeat(heatNumber: number) {
      return apiPost(`${base}/heats/${heatNumber}/complete${qs}`, {})
    },

    async undoHeat(heatNumber: number) {
      return apiDel(`${base}/heats/${heatNumber}/complete${qs}`)
    },

    async setStatus(status: string) {
      return apiPut(`${base}${qs}`, { status })
    },

    async updateSettings(patch: Record<string, unknown>) {
      return apiPut(`${base}${qs}`, patch)
    },

    async generateAssignments(useCumulative: boolean) {
      return apiPost(`${base}/assignments${qs}`, { useCumulative })
    },

    async saveHeatTime(heatNumber: number, isoTime: string) {
      return apiPut(`${base}/heat-times${qs}`, { heatNumber, isoTime })
    },

    async reorderAssignments(updates: AssignmentUpdate[]) {
      return apiPut(`${base}/assignments/reorder${qs}`, { updates })
    },

    async clearScores() {
      return apiDel(`${base}/scores${qs}`)
    },

    async resetWorkout() {
      return apiPost(`${base}/reset${qs}`, {})
    },

    async deleteWorkout() {
      return apiDel(`${base}${qs}`)
    },
  }
}
