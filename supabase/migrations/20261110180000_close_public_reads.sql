-- Close the direct public reads.
--
-- The site's public (anon) key is in every page, by design, so these
-- policies let anyone read these tables straight from the database API, for
-- every competition: secret workouts' names and descriptions before they
-- were announced, results a competition had set to stay hidden until the
-- workout was over, unlisted competitions' rosters.
--
-- Nothing needs them any more. The website reads only through the server
-- functions, which connect with server credentials (RLS does not apply to
-- them) and apply the TBA, visibility and unlisted rules themselves. Live
-- updates were the last direct reader, and they now come from per-
-- competition broadcasts (20261110170000_per_competition_live.sql) that
-- carry no rows.
--
-- RLS stays enabled on every table; with these gone the public roles read
-- nothing from them. The admin write policies are left as they were.

DROP POLICY IF EXISTS "public_read_competition"     ON "Competition";
DROP POLICY IF EXISTS "public_read_division"        ON "Division";
DROP POLICY IF EXISTS "public_read_athlete"         ON "Athlete";
DROP POLICY IF EXISTS "public_read_workout"         ON "Workout";
DROP POLICY IF EXISTS "public_read_heat_assignment" ON "HeatAssignment";
DROP POLICY IF EXISTS "public_read_score"           ON "Score";
DROP POLICY IF EXISTS "public_read_heat_completion" ON "HeatCompletion";
DROP POLICY IF EXISTS "public_read_checks_settings" ON "Setting";

-- Row-change streaming for these tables fed the old live updates. With no
-- subscribers left it is only cost, so it is switched off.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Score', 'HeatCompletion', 'Setting'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;
