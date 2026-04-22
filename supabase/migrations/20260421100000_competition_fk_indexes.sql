-- Plain B-tree indexes on competitionId foreign keys.
-- The existing composite UNIQUE indexes (competitionId, name) / (competitionId, number) /
-- (competitionId, key) do not cover lone `WHERE competitionId = $1` queries at scale
-- because PostgreSQL's leftmost-prefix rule only helps when the first column is the filter.
-- Without these, every /api/ops, /api/schedule, /api/leaderboard, and admin list page
-- does a seq scan on rows with matching competitionId.
--
-- Phase 0 of MVP hardening plan.

CREATE INDEX IF NOT EXISTS "Athlete_competitionId_idx"  ON "Athlete"("competitionId");
CREATE INDEX IF NOT EXISTS "Workout_competitionId_idx"  ON "Workout"("competitionId");
CREATE INDEX IF NOT EXISTS "Division_competitionId_idx" ON "Division"("competitionId");
