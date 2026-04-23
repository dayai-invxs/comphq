-- Enforce "lanes unique per heat per workout" as a DB invariant.
--
-- Historically the application allowed naked PATCH /assignments writes
-- with no uniqueness validation, so two athletes could (and did) end up
-- in the same (heatNumber, lane). This constraint closes that hole.
--
-- DEFERRABLE INITIALLY DEFERRED is required so that the reorder RPC
-- (see 20260423000100_reorder_assignments_rpc.sql) can move rows
-- through intermediate states that temporarily share a lane — the
-- constraint is only checked at commit.

DO $$
DECLARE
  dupe_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dupe_count
  FROM (
    SELECT 1 FROM "HeatAssignment"
    GROUP BY "workoutId", "heatNumber", "lane"
    HAVING COUNT(*) > 1
  ) d;

  IF dupe_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add heat_assignment_lane_unique: % duplicate (workoutId,heatNumber,lane) group(s) exist. Fix data first.',
      dupe_count;
  END IF;
END $$;

ALTER TABLE "HeatAssignment"
  ADD CONSTRAINT heat_assignment_lane_unique
  UNIQUE ("workoutId", "heatNumber", "lane")
  DEFERRABLE INITIALLY DEFERRED;
