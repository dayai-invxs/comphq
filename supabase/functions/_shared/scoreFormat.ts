export const REPS_MULTIPLIER = 10000

export function timeToMs(mins: number, secs: number, ms: number): number {
  return mins * 60000 + secs * 1000 + ms
}

export function msToTimeParts(totalMs: number): { mins: number; secs: number; ms: number } {
  const mins = Math.floor(totalMs / 60000)
  const secs = Math.floor((totalMs % 60000) / 1000)
  const ms = Math.round(totalMs % 1000)
  return { mins, secs, ms }
}

export function roundsRepsToScore(rounds: number, reps: number): number {
  return rounds * REPS_MULTIPLIER + reps
}

export function scoreToRoundsReps(score: number): { rounds: number; reps: number } {
  return { rounds: Math.floor(score / REPS_MULTIPLIER), reps: Math.round(score % REPS_MULTIPLIER) }
}

/**
 * The type a workout's scores are shown as. A rounds + reps workout where no
 * score has a single round was scored in reps alone, so its scores show as
 * the rep count (143, not 0r + 143). One round entered anywhere and every
 * score shows rounds again. Display only: ranking reads the raw score, which
 * is the same either way.
 */
export function displayScoreType(scoreType: string, rawScores: Iterable<number | null | undefined>): string {
  if (scoreType !== 'rounds_reps') return scoreType
  for (const r of rawScores) if (r != null && r >= REPS_MULTIPLIER) return scoreType
  return 'higher_is_better'
}

/** A capped score holds rounds and reps whatever the workout's score type. */
export function formatScore(rawScore: number, scoreType: string, capped = false): string {
  if (capped) {
    const { rounds, reps } = scoreToRoundsReps(rawScore)
    return `CAP ${rounds}r + ${reps}`
  }
  if (scoreType === 'time' || scoreType === 'lower_is_better') {
    const { mins, secs, ms } = msToTimeParts(rawScore)
    const cs = Math.round(ms / 10)
    return `${mins}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  }
  if (scoreType === 'rounds_reps') {
    const { rounds, reps } = scoreToRoundsReps(rawScore)
    return `${rounds}r + ${reps}`
  }
  return String(rawScore)
}

export function formatTiebreak(ms: number): string {
  const { mins, secs, ms: millis } = msToTimeParts(ms)
  const cs = Math.round(millis / 10)
  return `${mins}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}
