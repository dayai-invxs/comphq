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

export function formatScore(rawScore: number, scoreType: string): string {
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
