-- Realtime for the checks screens.
--
-- Checks live as two JSON rows in "Setting" (keys 'athleteChecks' and
-- 'equipChecks'), and the browser polled them every 3 seconds. This lets
-- clients subscribe to those rows instead, so the poll can slow down to a
-- safety net.
--
-- "Setting" is otherwise admin-only — it also holds judgePassword — so the
-- policy is row-scoped to exactly the two keys whose content the public
-- GET /api/checks endpoint already serves to any caller. Realtime applies
-- RLS per subscriber, so anon sockets receive events for these two rows and
-- nothing else in the table. Widening this policy is leaking settings.
CREATE POLICY "public_read_checks_settings" ON "Setting"
  FOR SELECT TO anon, authenticated
  USING (key IN ('athleteChecks', 'equipChecks'));

ALTER PUBLICATION supabase_realtime ADD TABLE "Setting";
