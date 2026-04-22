-- RLS for client-safe Realtime subscriptions.
--
-- Model: server routes authenticate with the service-role key, which bypasses
-- RLS entirely. The anon key is only handed to browsers for read-only
-- subscriptions on public tables (leaderboard, schedule, ops views).
--
-- Public read: Competition, Division, Athlete, Workout, HeatAssignment,
-- Score, HeatCompletion. No writes from anon — every mutation path
-- continues to go through our server routes with service-role.
--
-- Admin-only (no anon access at all): User, CompetitionMember, Setting,
-- AuditLog. RLS enabled but no policies granted, so anon reads return
-- zero rows.

-- ─── Public-readable tables ──────────────────────────────────────────────
ALTER TABLE "Competition"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Division"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Athlete"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workout"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HeatAssignment"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Score"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HeatCompletion"  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_competition"     ON "Competition"
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_division"        ON "Division"
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_athlete"         ON "Athlete"
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_workout"         ON "Workout"
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_heat_assignment" ON "HeatAssignment"
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_score"           ON "Score"
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_heat_completion" ON "HeatCompletion"
  FOR SELECT TO anon, authenticated USING (true);

-- ─── Admin-only tables (RLS on, no policies = deny-all to anon) ──────────
ALTER TABLE "User"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompetitionMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"          ENABLE ROW LEVEL SECURITY;

-- ─── Realtime publication: broadcast Score + HeatCompletion changes ──────
-- These two drive the live leaderboard. Subscribing clients get push
-- notifications within sub-second latency.
ALTER PUBLICATION supabase_realtime ADD TABLE "Score";
ALTER PUBLICATION supabase_realtime ADD TABLE "HeatCompletion";
