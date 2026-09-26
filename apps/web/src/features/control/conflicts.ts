import { getCorralMs, getHeatMs, getWalkoutMs, type WorkoutData } from '@/lib/opsHeats'

// v1: the inline `conflict` expression in AthleteControl.tsx, lifted out whole.
// It answers one question — is this heat about to collide with the workout
// beside it — and the control screen paints the row it names.
//
// Three ways a heat collides, all of them v1's:
//   * it starts at or after the earliest heat of the workout that follows it,
//   * it starts at or before the latest heat of the workout before it,
//   * its corral call lands within two minutes of that workout's last walk-out,
//     which is the one rule about people rather than clocks: a floor cannot be
//     cleared and refilled in less.
//
// Only the immediate neighbours are compared, not every other workout, and the
// order compared is the order the API returned. Both are v1's and both are
// kept: a competition runs its workouts in that order, one after another.

const GAP_MS = 2 * 60 * 1000

// Finite, not merely non-null: an unparseable start time makes calcHeatStartMs
// return NaN rather than null, and a NaN in the set poisons every comparison
// drawn from it. v1 filtered the same way for the same reason.
function heatTimes(workout: WorkoutData): number[] {
  return workout.heats
    .map((h) => getHeatMs(workout, h.heatNumber))
    .filter((ms): ms is number => ms != null && Number.isFinite(ms))
}

/** One heat's key, shared by the conflict set and the check maps. */
export function heatKey(workoutId: number, heatNumber: number): string {
  return `${workoutId}-${heatNumber}`
}

/** Heat keys (see heatKey) whose times collide. */
export function findConflicts(workouts: WorkoutData[]): Set<string> {
  const flagged = new Set<string>()

  workouts.forEach((workout, index) => {
    const next = workouts[index + 1]
    const prev = workouts[index - 1]
    const nextTimes = next ? heatTimes(next) : []
    const prevTimes = prev ? heatTimes(prev) : []

    const nextEarliestMs = nextTimes.length > 0 ? Math.min(...nextTimes) : null
    const prevLatestMs = prevTimes.length > 0 ? Math.max(...prevTimes) : null
    const prevLatestWalkoutMs =
      prev ? getWalkoutMs(prev, prevLatestMs) : null

    for (const heat of workout.heats) {
      const heatMs = getHeatMs(workout, heat.heatNumber)
      const corralMs = getCorralMs(workout, heatMs)
      const collides =
        (heatMs != null &&
          ((nextEarliestMs != null && heatMs >= nextEarliestMs) ||
            (prevLatestMs != null && heatMs <= prevLatestMs))) ||
        (corralMs != null && prevLatestWalkoutMs != null && corralMs <= prevLatestWalkoutMs + GAP_MS)

      if (collides) flagged.add(heatKey(workout.id, heat.heatNumber))
    }
  })

  return flagged
}
