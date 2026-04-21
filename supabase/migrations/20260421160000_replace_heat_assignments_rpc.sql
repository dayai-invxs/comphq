-- Atomic "replace heat assignments for a workout" function. Both
-- /api/workouts/[id]/assignments POST and /api/import/heats POST use this
-- to get transactional DELETE+INSERT+UPDATE behavior (previously all three
-- ran as separate HTTP round-trips with no rollback on partial failure).
--
-- Phase 4 of MVP hardening plan (COM-9 #7/#8).

CREATE OR REPLACE FUNCTION replace_workout_heat_assignments(
  p_workout_id INTEGER,
  p_assignments JSONB  -- array of { athleteId, heatNumber, lane }
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM "HeatAssignment" WHERE "workoutId" = p_workout_id;

  IF jsonb_array_length(p_assignments) > 0 THEN
    INSERT INTO "HeatAssignment" ("workoutId", "athleteId", "heatNumber", "lane")
    SELECT
      p_workout_id,
      (a->>'athleteId')::int,
      (a->>'heatNumber')::int,
      (a->>'lane')::int
    FROM jsonb_array_elements(p_assignments) a;
  END IF;

  UPDATE "Workout" SET "heatStartOverrides" = '{}' WHERE id = p_workout_id;
END;
$$;
