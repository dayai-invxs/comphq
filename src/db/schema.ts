// Drizzle schema — single source of truth for the public schema shape.
//
// Columns/types/defaults cross-referenced from:
//   - src/lib/db-types.ts (Supabase-generated, reflects current DB)
//   - supabase/migrations/*.sql (historical migration authority)
//
// auth.users is declared only as a reference stub — Supabase Auth owns it.

import {
  pgTable,
  pgSchema,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  uuid,
  doublePrecision,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

// ─── auth schema stub (referenced by UserProfile, CompetitionAdmin, etc.) ────
export const authSchema = pgSchema('auth')
export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
})

// ─── Core tables ─────────────────────────────────────────────────────────────

export const competition = pgTable('Competition', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
}, (t) => [
  uniqueIndex('Competition_slug_key').on(t.slug),
])

export const userProfile = pgTable('UserProfile', {
  id: uuid('id').primaryKey().references(() => authUsers.id, { onDelete: 'cascade' }),
  isSuper: boolean('isSuper').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

export const competitionAdmin = pgTable('CompetitionAdmin', {
  userId: uuid('userId').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  competitionId: integer('competitionId').notNull().references(() => competition.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.competitionId] }),
  index('CompetitionAdmin_competitionId_idx').on(t.competitionId),
])

// Legacy — ghost table left over from the roles_v2 migration rename. Kept
// here so drizzle-kit generate doesn't try to drop it. No app code uses it.
export const competitionMember = pgTable('CompetitionMember', {
  userId: uuid('userId').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  competitionId: integer('competitionId').notNull().references(() => competition.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('scorekeeper'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.competitionId] }),
])

export const division = pgTable('Division', {
  id: serial('id').primaryKey(),
  competitionId: integer('competitionId').notNull().references(() => competition.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  order: integer('order').notNull(),
}, (t) => [
  uniqueIndex('Division_competitionId_name_key').on(t.competitionId, t.name),
  index('Division_competitionId_idx').on(t.competitionId),
])

export const athlete = pgTable('Athlete', {
  id: serial('id').primaryKey(),
  competitionId: integer('competitionId').notNull().references(() => competition.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  bibNumber: text('bibNumber'),
  divisionId: integer('divisionId').references(() => division.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  userId: uuid('userId').references(() => authUsers.id, { onDelete: 'set null' }),
  withdrawn: boolean('withdrawn').notNull().default(false),
}, (t) => [
  index('Athlete_competitionId_idx').on(t.competitionId),
])

export const workoutLocation = pgTable('WorkoutLocation', {
  id: serial('id').primaryKey(),
  competitionId: integer('competitionId').notNull().references(() => competition.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
})

export const workout = pgTable('Workout', {
  id: serial('id').primaryKey(),
  competitionId: integer('competitionId').notNull().references(() => competition.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  number: integer('number').notNull(),
  name: text('name').notNull(),
  scoreType: text('scoreType').notNull(),
  lanes: integer('lanes').notNull(),
  heatIntervalSecs: integer('heatIntervalSecs').notNull(),
  timeBetweenHeatsSecs: integer('timeBetweenHeatsSecs').notNull().default(120),
  callTimeSecs: integer('callTimeSecs').notNull(),
  walkoutTimeSecs: integer('walkoutTimeSecs').notNull(),
  startTime: timestamp('startTime', { precision: 3, mode: 'string' }),
  status: text('status').notNull().default('draft'),
  mixedHeats: boolean('mixedHeats').notNull().default(true),
  tiebreakEnabled: boolean('tiebreakEnabled').notNull().default(false),
  tiebreakScoreType: text('tiebreakScoreType').notNull().default('time'),
  partBEnabled: boolean('partBEnabled').notNull().default(false),
  partBScoreType: text('partBScoreType').notNull().default('time'),
  halfWeight: boolean('halfWeight').notNull().default(false),
  heatStartOverrides: text('heatStartOverrides').notNull().default('{}'),
  locationId: integer('locationId').references(() => workoutLocation.id, { onDelete: 'set null' }),
}, (t) => [
  uniqueIndex('Workout_competitionId_number_key').on(t.competitionId, t.number),
  index('Workout_competitionId_idx').on(t.competitionId),
])

export const heatAssignment = pgTable('HeatAssignment', {
  id: serial('id').primaryKey(),
  workoutId: integer('workoutId').notNull().references(() => workout.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  athleteId: integer('athleteId').notNull().references((): AnyPgColumn => athlete.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  heatNumber: integer('heatNumber').notNull(),
  lane: integer('lane').notNull(),
}, (t) => [
  uniqueIndex('HeatAssignment_workoutId_athleteId_key').on(t.workoutId, t.athleteId),
  uniqueIndex('heat_assignment_lane_unique').on(t.workoutId, t.heatNumber, t.lane),
])

export const heatCompletion = pgTable('HeatCompletion', {
  id: serial('id').primaryKey(),
  workoutId: integer('workoutId').notNull().references(() => workout.id, { onDelete: 'cascade' }),
  heatNumber: integer('heatNumber').notNull(),
  completedAt: timestamp('completedAt', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

export const score = pgTable('Score', {
  id: serial('id').primaryKey(),
  athleteId: integer('athleteId').notNull().references(() => athlete.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  workoutId: integer('workoutId').notNull().references(() => workout.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  rawScore: doublePrecision('rawScore').notNull(),
  tiebreakRawScore: doublePrecision('tiebreakRawScore'),
  points: integer('points'),
  partBRawScore: doublePrecision('partBRawScore'),
  partBPoints: integer('partBPoints'),
}, (t) => [
  uniqueIndex('Score_athleteId_workoutId_key').on(t.athleteId, t.workoutId),
])

export const setting = pgTable('Setting', {
  competitionId: integer('competitionId').notNull().references(() => competition.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
}, (t) => [
  primaryKey({ columns: [t.competitionId, t.key] }),
])

export const volunteerRole = pgTable('VolunteerRole', {
  id: serial('id').primaryKey(),
  competitionId: integer('competitionId').notNull().references(() => competition.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
})

export const volunteer = pgTable('Volunteer', {
  id: serial('id').primaryKey(),
  competitionId: integer('competitionId').notNull().references(() => competition.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  roleId: integer('roleId').references(() => volunteerRole.id, { onDelete: 'set null' }),
})

export const workoutEquipment = pgTable('WorkoutEquipment', {
  id: serial('id').primaryKey(),
  workoutId: integer('workoutId').notNull().references(() => workout.id, { onDelete: 'cascade' }),
  item: text('item').notNull(),
  divisionId: integer('divisionId').references(() => division.id, { onDelete: 'cascade' }),
})

export const auditLog = pgTable('AuditLog', {
  id: serial('id').primaryKey(),
  userId: uuid('userId').references(() => authUsers.id, { onDelete: 'set null' }),
  userName: text('userName'),
  action: text('action').notNull(),
  resourceType: text('resourceType').notNull(),
  resourceId: text('resourceId'),
  competitionId: integer('competitionId').references(() => competition.id, { onDelete: 'set null' }),
  diff: jsonb('diff'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

// ─── Inferred row / insert types ─────────────────────────────────────────────

export type Competition = typeof competition.$inferSelect
export type NewCompetition = typeof competition.$inferInsert
export type UserProfile = typeof userProfile.$inferSelect
export type NewUserProfile = typeof userProfile.$inferInsert
export type CompetitionAdmin = typeof competitionAdmin.$inferSelect
export type NewCompetitionAdmin = typeof competitionAdmin.$inferInsert
export type Division = typeof division.$inferSelect
export type NewDivision = typeof division.$inferInsert
export type Athlete = typeof athlete.$inferSelect
export type NewAthlete = typeof athlete.$inferInsert
export type WorkoutLocation = typeof workoutLocation.$inferSelect
export type NewWorkoutLocation = typeof workoutLocation.$inferInsert
export type Workout = typeof workout.$inferSelect
export type NewWorkout = typeof workout.$inferInsert
export type HeatAssignment = typeof heatAssignment.$inferSelect
export type NewHeatAssignment = typeof heatAssignment.$inferInsert
export type HeatCompletion = typeof heatCompletion.$inferSelect
export type NewHeatCompletion = typeof heatCompletion.$inferInsert
export type Score = typeof score.$inferSelect
export type NewScore = typeof score.$inferInsert
export type Setting = typeof setting.$inferSelect
export type NewSetting = typeof setting.$inferInsert
export type VolunteerRole = typeof volunteerRole.$inferSelect
export type NewVolunteerRole = typeof volunteerRole.$inferInsert
export type Volunteer = typeof volunteer.$inferSelect
export type NewVolunteer = typeof volunteer.$inferInsert
export type WorkoutEquipment = typeof workoutEquipment.$inferSelect
export type NewWorkoutEquipment = typeof workoutEquipment.$inferInsert
export type AuditLog = typeof auditLog.$inferSelect
export type NewAuditLog = typeof auditLog.$inferInsert
