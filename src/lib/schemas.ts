import { z } from 'zod'

/**
 * Shared zod schemas for every API route's request body.
 * Keep them narrow and explicit — no `passthrough()` / `.optional()` on fields
 * the route doesn't actually support.
 */

// ─── Primitives ───────────────────────────────────────────────────────────

export const Slug = z.string().trim().min(1).max(64)
export const Id = z.number().int().positive()
export const NonEmptyString = z.string().trim().min(1)

// Loosely coerce number-or-string to number (admin forms sometimes send strings).
export const NumericInt = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = typeof v === 'number' ? v : parseInt(v, 10)
  if (Number.isNaN(n)) {
    ctx.addIssue({ code: 'custom', message: 'expected a number' })
    return z.NEVER
  }
  return n
})

export const ScoreType = z.enum(['time', 'rounds_reps', 'higher_is_better', 'lower_is_better', 'weight'])
export const WorkoutStatus = z.enum(['draft', 'active', 'completed'])
export const MemberRole = z.enum(['admin', 'scorekeeper'])
export const SiteRole = z.enum(['admin', 'user'])

// ─── Competitions ─────────────────────────────────────────────────────────

export const CompetitionCreate = z.object({
  name: NonEmptyString.max(120),
  slug: z.string().trim().min(1).max(64),
})
export const CompetitionUpdate = z.object({
  name: NonEmptyString.max(120).optional(),
  slug: z.string().trim().min(1).max(64).optional(),
})

// ─── Athletes ─────────────────────────────────────────────────────────────

export const AthleteCreate = z.object({
  slug: Slug,
  name: NonEmptyString.max(120),
  bibNumber: z.string().trim().max(32).nullable().optional(),
  divisionId: Id.nullable().optional(),
})
export const AthleteUpdate = z.object({
  name: NonEmptyString.max(120),
  bibNumber: z.string().trim().max(32).nullable().optional(),
  divisionId: Id.nullable().optional(),
})
export const AthleteBulkDelete = z.object({
  slug: Slug,
  ids: z.array(Id).min(1).max(500),
})

export const VolunteerCreate = z.object({
  slug: Slug,
  name: NonEmptyString.max(120),
  roleId: Id.nullable().optional(),
})
export const VolunteerUpdate = z.object({
  name: NonEmptyString.max(120),
  roleId: Id.nullable().optional(),
})
export const VolunteerBulkDelete = z.object({
  slug: Slug,
  ids: z.array(Id).min(1).max(500),
})

// ─── Divisions ────────────────────────────────────────────────────────────

export const DivisionCreate = z.object({
  slug: Slug,
  name: NonEmptyString.max(60),
  order: NumericInt.pipe(z.number().int().nonnegative()),
})
export const DivisionUpdate = z.object({
  name: NonEmptyString.max(60).optional(),
  order: NumericInt.pipe(z.number().int().nonnegative()).optional(),
}).refine((v) => Object.keys(v).length > 0, 'At least one field required')

// ─── Workout Locations ────────────────────────────────────────────────────

export const WorkoutLocationCreate = z.object({
  slug: Slug,
  name: NonEmptyString.max(80),
})
export const WorkoutLocationUpdate = z.object({
  name: NonEmptyString.max(80),
})

// ─── Volunteer Roles ──────────────────────────────────────────────────────

export const VolunteerRoleCreate = z.object({
  slug: Slug,
  name: NonEmptyString.max(80),
})
export const VolunteerRoleUpdate = z.object({
  name: NonEmptyString.max(80),
})

// ─── Workouts ─────────────────────────────────────────────────────────────

export const WorkoutCreate = z.object({
  slug: Slug,
  number: NumericInt.pipe(z.number().int().positive()),
  name: NonEmptyString.max(120),
  scoreType: ScoreType,
  lanes: NumericInt.pipe(z.number().int().min(1).max(20)),
  heatIntervalSecs: NumericInt.pipe(z.number().int().positive()),
  timeBetweenHeatsSecs: NumericInt.pipe(z.number().int().nonnegative()).optional(),
  callTimeSecs: NumericInt.pipe(z.number().int().nonnegative()),
  walkoutTimeSecs: NumericInt.pipe(z.number().int().nonnegative()),
  startTime: z.iso.datetime().nullable().optional(),
  mixedHeats: z.boolean().optional(),
  tiebreakEnabled: z.boolean().optional(),
  partBEnabled: z.boolean().optional(),
  partBScoreType: ScoreType.optional(),
  halfWeight: z.boolean().optional(),
  locationId: Id.nullable().optional(),
})

export const WorkoutUpdate = z.object({
  name: NonEmptyString.max(120).optional(),
  scoreType: ScoreType.optional(),
  lanes: NumericInt.pipe(z.number().int().min(1).max(20)).optional(),
  heatIntervalSecs: NumericInt.pipe(z.number().int().positive()).optional(),
  timeBetweenHeatsSecs: NumericInt.pipe(z.number().int().nonnegative()).optional(),
  callTimeSecs: NumericInt.pipe(z.number().int().nonnegative()).optional(),
  walkoutTimeSecs: NumericInt.pipe(z.number().int().nonnegative()).optional(),
  startTime: z.iso.datetime().nullable().optional(),
  status: WorkoutStatus.optional(),
  mixedHeats: z.boolean().optional(),
  tiebreakEnabled: z.boolean().optional(),
  partBEnabled: z.boolean().optional(),
  partBScoreType: ScoreType.optional(),
  number: NumericInt.pipe(z.number().int().positive()).optional(),
  halfWeight: z.boolean().optional(),
  locationId: Id.nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, 'At least one field required')

export const WorkoutEquipmentCreate = z.object({
  item: NonEmptyString.max(200),
  divisionId: Id.nullable().optional(),
})

// ─── Workout nested ───────────────────────────────────────────────────────

export const ScoreUpsert = z.object({
  athleteId: Id,
  rawScore: z.number(),
  tiebreakRawScore: z.number().nullable().optional(),
  partBRawScore: z.number().nullable().optional(),
})

export const AssignmentRegen = z.object({
  useCumulative: z.boolean().optional(),
}).optional().default({})

export const AssignmentPatch = z.object({
  id: Id,
  heatNumber: NumericInt.pipe(z.number().int().positive()),
  lane: NumericInt.pipe(z.number().int().positive()),
})

export const HeatTimeSet = z.object({
  heatNumber: NumericInt.pipe(z.number().int().positive()),
  isoTime: z.iso.datetime(),
})

// ─── Settings / Import / Users ────────────────────────────────────────────

export const SettingsPatch = z.object({
  slug: Slug,
  showBib: z.boolean().optional(),
  tiebreakWorkoutId: Id.nullable().optional(),
  leaderboardVisibility: z.enum(['per_heat', 'per_workout']).optional(),
})

export const CsvImport = z.object({
  slug: Slug,
  csv: z.string().min(1),
})

export const UserCreate = z.object({
  username: NonEmptyString.max(60),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  role: SiteRole.optional(),
})

export const UserUpdate = z.object({
  password: z.string().min(12, 'Password must be at least 12 characters'),
})
