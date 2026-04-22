-- The HeatCompletion table is now the source of truth for completed heats
-- (created in 20260421140000). Every reader and writer has been migrated
-- in the previous commit, so the legacy text-JSON blob can be dropped.
--
-- Phase 3 of MVP hardening plan.

ALTER TABLE "Workout" DROP COLUMN IF EXISTS "completedHeats";
