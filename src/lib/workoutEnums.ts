import { ScoreType, WorkoutStatus } from './schemas'
import type { z } from 'zod'

// Exported unions so consumers can `: WorkoutStatusValue` instead of `: string`.
export type ScoreTypeValue = z.infer<typeof ScoreType>
export type WorkoutStatusValue = z.infer<typeof WorkoutStatus>

// Score-type dropdown options (what the user picks when creating/editing).
// Only the "primary" three are offered in the UI; higher_is_better /
// lower_is_better are legacy aliases we still accept at the API boundary.
export const SCORE_TYPE_OPTIONS: Array<{ value: ScoreTypeValue; label: string }> = [
  { value: 'time',         label: 'Time (lower is better)' },
  { value: 'rounds_reps',  label: 'Rounds + Reps (higher is better)' },
  { value: 'weight',       label: 'Weight (higher is better)' },
]

// Compact labels used in lists / row summaries.
export const SCORE_TYPE_LABELS: Record<ScoreTypeValue, string> = {
  time:              'Time',
  rounds_reps:       'Rounds + Reps',
  weight:            'Weight',
  lower_is_better:   'Time',
  higher_is_better:  'Reps / Weight',
}

export function scoreTypeLabel(v: string): string {
  return SCORE_TYPE_LABELS[v as ScoreTypeValue] ?? v
}

// Status badge styling — single source of truth for draft/active/completed
// appearance across admin pages + public schedule.
export const STATUS_STYLES: Record<WorkoutStatusValue, { label: string; className: string }> = {
  draft:     { label: 'Draft',     className: 'bg-gray-700 text-gray-300' },
  active:    { label: 'Active',    className: 'bg-green-800 text-green-300' },
  completed: { label: 'Completed', className: 'bg-blue-900 text-blue-300' },
}

export function statusStyle(status: string): { label: string; className: string } {
  return STATUS_STYLES[status as WorkoutStatusValue] ?? { label: status, className: 'bg-gray-700 text-gray-300' }
}
