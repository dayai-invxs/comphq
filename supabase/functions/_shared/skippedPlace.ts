// An athlete who skips a workout ranks last in it. They take the place after
// the last athlete in their division who scored, tied with anyone else in the
// division who skipped it: seven scored, so a skip is 8th. Missing a workout
// used to add no points at all, so skipping one could lift an athlete.
//
// Only a finished workout places anyone this way. While one is running, an
// athlete with no score may simply not have gone yet. And a division nobody
// scored in did not run the workout, so nobody in it is placed either.

export type SkipWorkout = { id: number; status: string }
export type SkipAthlete = { id: number; division: number | string | null }

/**
 * The place a skipped workout gives, per athlete and workout: a number where
 * the athlete has no points in a completed workout their division ran, else
 * null. `points` answers the points an athlete holds in a workout, or null.
 */
export function skippedPlaces(
  workouts: SkipWorkout[],
  athletes: SkipAthlete[],
  points: (athleteId: number, workoutId: number) => number | null | undefined,
): (athleteId: number, workoutId: number) => number | null {
  const scored = new Map<string, number>()
  const key = (workoutId: number, division: SkipAthlete['division']) => `${workoutId}:${division ?? ''}`
  const completed = workouts.filter((w) => w.status === 'completed')
  for (const w of completed) {
    for (const a of athletes) {
      if (points(a.id, w.id) != null) scored.set(key(w.id, a.division), (scored.get(key(w.id, a.division)) ?? 0) + 1)
    }
  }
  const divisionOf = new Map(athletes.map((a) => [a.id, a.division]))
  const done = new Set(completed.map((w) => w.id))

  return (athleteId, workoutId) => {
    if (!done.has(workoutId) || points(athleteId, workoutId) != null) return null
    const count = scored.get(key(workoutId, divisionOf.get(athleteId) ?? null)) ?? 0
    return count > 0 ? count + 1 : null
  }
}
