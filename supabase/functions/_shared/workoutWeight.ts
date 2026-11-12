/** How much a workout's place counts toward the overall total: half, once or
    twice. Totals are places, so a bigger weight makes the workout matter more
    either way — a win adds 2 instead of 1, a 10th adds 20 instead of 10. */
export function workoutWeight(w: { halfWeight?: boolean | null; doubleWeight?: boolean | null }): number {
  if (w.doubleWeight) return 2
  if (w.halfWeight) return 0.5
  return 1
}
