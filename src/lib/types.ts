// Single source of truth for domain types: the generated Supabase types.
//
// Regenerate after any schema change:
//   npm run db:types
//
// If you find yourself defining a type that mirrors a DB row, re-export it
// from here instead. `db-types.ts` is auto-generated and never hand-edited.

import type { Database } from './db-types'

type Tables = Database['public']['Tables']

export type Setting = Tables['Setting']['Row']
export type Division = Tables['Division']['Row']
export type UserProfile = Tables['UserProfile']['Row']
export type Competition = Tables['Competition']['Row']
export type CompetitionAdmin = Tables['CompetitionAdmin']['Row']
export type HeatCompletion = Tables['HeatCompletion']['Row']
export type AuditLog = Tables['AuditLog']['Row']

// Athlete carries an optional embedded division (PostgREST `.select('*, division:Division(*)')`).
export type Athlete = Tables['Athlete']['Row'] & { division?: Division | null }

// Workout row (schema). API responses may include virtual fields like
// `completedHeats: number[]` (derived from HeatCompletion) — callers add
// those fields explicitly; they're not part of the DB row.
export type Workout = Tables['Workout']['Row']

// HeatAssignment with optional embedded athlete + workout.
export type HeatAssignment = Tables['HeatAssignment']['Row'] & {
  athlete?: Athlete
  workout?: Workout
}

// Score with optional embedded athlete + workout.
export type Score = Tables['Score']['Row'] & {
  athlete?: Athlete
  workout?: Workout
}
