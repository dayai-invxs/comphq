-- Defense-in-depth: RLS policies that gate writes by super-admin OR
-- CompetitionAdmin membership. The server routes use the service-role
-- key which bypasses RLS, so today these policies never fire on the
-- happy path. They exist to catch:
--
-- 1. A future route that forgets to call requireCompetitionAdmin.
-- 2. Any client-side writes that might ship in the future (e.g. athlete
--    users claiming their own records).
-- 3. Direct anon/authed DB access from a stolen key.
--
-- SELECT-side policies stay as-is ("public read" for the seven
-- public-data tables). This migration only adds INSERT/UPDATE/DELETE
-- rules for `authenticated`.

-- ─── Helper: "can the current user manage this competition?" ────────────
CREATE OR REPLACE FUNCTION public.can_manage_competition(comp_id int)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public."UserProfile"
           WHERE id = auth.uid() AND "isSuper"
         )
      OR EXISTS (
           SELECT 1 FROM public."CompetitionAdmin"
           WHERE "userId" = auth.uid() AND "competitionId" = comp_id
         );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_competition(int) TO authenticated;

-- Convenience wrapper for tables that reference a workout: resolves the
-- workout's competitionId and delegates.
CREATE OR REPLACE FUNCTION public.can_manage_workout(workout_id int)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.can_manage_competition(
    (SELECT "competitionId" FROM public."Workout" WHERE id = workout_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_workout(int) TO authenticated;

-- ─── Competition: super admins can write; anyone reads (public) ─────────
CREATE POLICY "super_writes_competition" ON "Competition"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM "UserProfile" WHERE id = auth.uid() AND "isSuper")
  );
CREATE POLICY "super_updates_competition" ON "Competition"
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "UserProfile" WHERE id = auth.uid() AND "isSuper")
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "UserProfile" WHERE id = auth.uid() AND "isSuper")
  );
CREATE POLICY "super_deletes_competition" ON "Competition"
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "UserProfile" WHERE id = auth.uid() AND "isSuper")
  );

-- ─── Per-competition tables: writes gated by can_manage_competition ─────
CREATE POLICY "admin_writes_division" ON "Division"
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_competition("competitionId"));
CREATE POLICY "admin_updates_division" ON "Division"
  FOR UPDATE TO authenticated
  USING (public.can_manage_competition("competitionId"))
  WITH CHECK (public.can_manage_competition("competitionId"));
CREATE POLICY "admin_deletes_division" ON "Division"
  FOR DELETE TO authenticated USING (public.can_manage_competition("competitionId"));

CREATE POLICY "admin_writes_athlete" ON "Athlete"
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_competition("competitionId"));
CREATE POLICY "admin_updates_athlete" ON "Athlete"
  FOR UPDATE TO authenticated
  USING (public.can_manage_competition("competitionId"))
  WITH CHECK (public.can_manage_competition("competitionId"));
CREATE POLICY "admin_deletes_athlete" ON "Athlete"
  FOR DELETE TO authenticated USING (public.can_manage_competition("competitionId"));

CREATE POLICY "admin_writes_workout" ON "Workout"
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_competition("competitionId"));
CREATE POLICY "admin_updates_workout" ON "Workout"
  FOR UPDATE TO authenticated
  USING (public.can_manage_competition("competitionId"))
  WITH CHECK (public.can_manage_competition("competitionId"));
CREATE POLICY "admin_deletes_workout" ON "Workout"
  FOR DELETE TO authenticated USING (public.can_manage_competition("competitionId"));

-- ─── Tables with workoutId (no direct competitionId) ────────────────────
CREATE POLICY "admin_writes_heat_assignment" ON "HeatAssignment"
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_workout("workoutId"));
CREATE POLICY "admin_updates_heat_assignment" ON "HeatAssignment"
  FOR UPDATE TO authenticated
  USING (public.can_manage_workout("workoutId"))
  WITH CHECK (public.can_manage_workout("workoutId"));
CREATE POLICY "admin_deletes_heat_assignment" ON "HeatAssignment"
  FOR DELETE TO authenticated USING (public.can_manage_workout("workoutId"));

CREATE POLICY "admin_writes_score" ON "Score"
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_workout("workoutId"));
CREATE POLICY "admin_updates_score" ON "Score"
  FOR UPDATE TO authenticated
  USING (public.can_manage_workout("workoutId"))
  WITH CHECK (public.can_manage_workout("workoutId"));
CREATE POLICY "admin_deletes_score" ON "Score"
  FOR DELETE TO authenticated USING (public.can_manage_workout("workoutId"));

CREATE POLICY "admin_writes_heat_completion" ON "HeatCompletion"
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_workout("workoutId"));
CREATE POLICY "admin_updates_heat_completion" ON "HeatCompletion"
  FOR UPDATE TO authenticated
  USING (public.can_manage_workout("workoutId"))
  WITH CHECK (public.can_manage_workout("workoutId"));
CREATE POLICY "admin_deletes_heat_completion" ON "HeatCompletion"
  FOR DELETE TO authenticated USING (public.can_manage_workout("workoutId"));

-- ─── Setting (admin-only everything; anon can't read settings) ──────────
CREATE POLICY "admin_reads_setting" ON "Setting"
  FOR SELECT TO authenticated USING (public.can_manage_competition("competitionId"));
CREATE POLICY "admin_writes_setting" ON "Setting"
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_competition("competitionId"));
CREATE POLICY "admin_updates_setting" ON "Setting"
  FOR UPDATE TO authenticated
  USING (public.can_manage_competition("competitionId"))
  WITH CHECK (public.can_manage_competition("competitionId"));
CREATE POLICY "admin_deletes_setting" ON "Setting"
  FOR DELETE TO authenticated USING (public.can_manage_competition("competitionId"));

-- ─── UserProfile: user reads own row; super admins can read all ─────────
CREATE POLICY "read_own_profile" ON "UserProfile"
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "super_reads_all_profiles" ON "UserProfile"
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "UserProfile" p WHERE p.id = auth.uid() AND p."isSuper")
  );
CREATE POLICY "super_writes_profile" ON "UserProfile"
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "UserProfile" p WHERE p.id = auth.uid() AND p."isSuper")
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "UserProfile" p WHERE p.id = auth.uid() AND p."isSuper")
  );

-- ─── CompetitionAdmin: super admins manage; users see their own rows ────
CREATE POLICY "read_own_admin_rows" ON "CompetitionAdmin"
  FOR SELECT TO authenticated USING ("userId" = auth.uid());
CREATE POLICY "super_reads_all_admin_rows" ON "CompetitionAdmin"
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "UserProfile" p WHERE p.id = auth.uid() AND p."isSuper")
  );
CREATE POLICY "super_writes_admin_rows" ON "CompetitionAdmin"
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM "UserProfile" p WHERE p.id = auth.uid() AND p."isSuper")
  );
CREATE POLICY "super_deletes_admin_rows" ON "CompetitionAdmin"
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM "UserProfile" p WHERE p.id = auth.uid() AND p."isSuper")
  );

-- ─── AuditLog stays deny-all to anon/authed — server-role only. ─────────
