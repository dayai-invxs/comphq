-- Transactional reorder RPC for heat assignments.
--
-- Callers (PUT /api/workouts/[id]/assignments/reorder) hand in the minimal
-- set of rows whose (heatNumber, lane) need to change. This function does
-- them all in one transaction, relying on the DEFERRABLE unique constraint
-- (see 20260423000000) to catch any invalid end state at commit. Partial
-- failure is impossible: either every update lands and the constraint
-- holds, or the transaction aborts and nothing changes.
--
-- SECURITY INVOKER — relies on the table's RLS policies (same as
-- replace_workout_heat_assignments).

CREATE OR REPLACE FUNCTION reorder_workout_assignments(
  p_workout_id INTEGER,
  p_updates JSONB  -- array of { id, heatNumber, lane }
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF jsonb_array_length(p_updates) = 0 THEN
    RETURN;
  END IF;

  UPDATE "HeatAssignment" h
     SET "heatNumber" = (u->>'heatNumber')::int,
         "lane"       = (u->>'lane')::int
    FROM jsonb_array_elements(p_updates) u
   WHERE h.id          = (u->>'id')::int
     AND h."workoutId" = p_workout_id;
END;
$$;
