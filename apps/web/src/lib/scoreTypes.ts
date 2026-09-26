// The score-type half of v1's workoutEnums.ts, values and wording unchanged.
// The status half is workoutStatus.ts: that is the half that carried Tailwind
// class strings, and splitting them is what let the rest stay a copy.
//
// The two legacy aliases are accepted at the API boundary and have labels, but
// v1 never offered them in a dropdown. Neither does this.
export type ScoreTypeValue =
  | 'time'
  | 'rounds_reps'
  | 'weight'
  | 'lower_is_better'
  | 'higher_is_better'

export const SCORE_TYPE_OPTIONS: Array<{ value: ScoreTypeValue; label: string }> = [
  { value: 'time', label: 'Time (lower is better)' },
  { value: 'rounds_reps', label: 'Rounds + Reps (higher is better)' },
  { value: 'weight', label: 'Weight (higher is better)' },
]

const SCORE_TYPE_LABELS: Record<ScoreTypeValue, string> = {
  time: 'Time',
  rounds_reps: 'Rounds + Reps',
  weight: 'Weight',
  lower_is_better: 'Time',
  higher_is_better: 'Reps / Weight',
}

export function scoreTypeLabel(v: string): string {
  return SCORE_TYPE_LABELS[v as ScoreTypeValue] ?? v
}
