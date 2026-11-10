-- A team may be placed in more than one heat of the same workout when the
-- imported sheet does that (the app warns and highlights, but allows it).
-- The pair keeps a plain index for lookups; lanes stay unique per heat.
DROP INDEX IF EXISTS "HeatAssignment_workoutId_athleteId_key";
CREATE INDEX IF NOT EXISTS "HeatAssignment_workoutId_athleteId_idx"
  ON "HeatAssignment" ("workoutId", "athleteId");
