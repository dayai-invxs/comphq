-- HeatCompletion table replaces the completedHeats text-JSON blob on Workout.
-- Eliminates the read-modify-write race flagged in COM-9 #1: two concurrent
-- "Complete Heat" clicks could corrupt or drop each other's array mutations.
-- The unique constraint on (workoutId, heatNumber) makes dual completions
-- idempotent.
--
-- Phase 3 of MVP hardening plan.

CREATE TABLE IF NOT EXISTS "HeatCompletion" (
  "id"         SERIAL PRIMARY KEY,
  "workoutId"  INTEGER NOT NULL REFERENCES "Workout"("id") ON DELETE CASCADE,
  "heatNumber" INTEGER NOT NULL,
  "completedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "HeatCompletion_workoutId_heatNumber_key"
  ON "HeatCompletion"("workoutId", "heatNumber");
CREATE INDEX IF NOT EXISTS "HeatCompletion_workoutId_idx"
  ON "HeatCompletion"("workoutId");

-- Backfill from the existing JSON blob. Only processes non-empty arrays.
INSERT INTO "HeatCompletion" ("workoutId", "heatNumber")
SELECT w.id, (v.value)::int
FROM "Workout" w,
     jsonb_array_elements_text(
       CASE WHEN w."completedHeats" IS NULL OR w."completedHeats" = '' THEN '[]'::jsonb
            ELSE w."completedHeats"::jsonb
       END
     ) AS v
ON CONFLICT DO NOTHING;

-- Keep the column around for now; routes are migrated in a follow-up commit.
-- The column will be dropped once all readers/writers use HeatCompletion.
