import { postJson, putJson, delJson } from '@/lib/http'
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
 */
export function buildWorkoutMutations(workoutId: string, slug: string) {
  const qs = `?slug=${encodeURIComponent(slug)}`
  const base = `/api/workouts/${workoutId}`

  return {
    async load<T>() {
      const res = await fetch(`${base}${qs}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`GET ${base} → ${res.status}`)
      return (await res.json()) as T
    },

    async saveScorePayload(payload: ScorePayload) {
      return postJson(`${base}/scores${qs}`, payload)
    },

    /**
     * Save all scores in parallel. If any one fails, the whole batch
     * rejects (Promise.all fail-fast). Callers should surface the error
     * in UI and NOT proceed with downstream steps (e.g. /calculate).
     */
    async saveAll(payloads: ScorePayload[]) {
      await Promise.all(payloads.map((p) => postJson(`${base}/scores${qs}`, p)))
    },

    async calculate() {
      return postJson(`${base}/calculate${qs}`, {})
    },

    async completeHeat(heatNumber: number) {
      return postJson(`${base}/heats/${heatNumber}/complete${qs}`, {})
    },

    async undoHeat(heatNumber: number) {
      return delJson(`${base}/heats/${heatNumber}/complete${qs}`)
    },

    async setStatus(status: string) {
      return putJson(`${base}${qs}`, { status })
    },

    async updateSettings(patch: Record<string, unknown>) {
      return putJson(`${base}${qs}`, patch)
    },

    async generateAssignments(useCumulative: boolean) {
      return postJson(`${base}/assignments${qs}`, { useCumulative })
    },

    async saveHeatTime(heatNumber: number, isoTime: string) {
      return putJson(`${base}/heat-times${qs}`, { heatNumber, isoTime })
    },

    async reorderAssignments(updates: AssignmentUpdate[]) {
      return putJson(`${base}/assignments/reorder${qs}`, { updates })
    },

    async clearScores() {
      return delJson(`${base}/scores${qs}`)
    },

    async deleteWorkout() {
      return delJson(`${base}${qs}`)
    },
  }
}
