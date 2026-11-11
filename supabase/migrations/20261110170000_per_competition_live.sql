-- Live updates per competition, and the judge password each competition has
-- been using kept in place before the built-in default changes.

-- 1. The built-in judge password for new competitions becomes "I'majudge".
--    A competition that never set its own has been running on the old
--    built-in "rug702"; it is written down for each of them here, so changing
--    the default does not lock out judges mid-event.
INSERT INTO "Setting" ("competitionId", key, value)
SELECT c.id, 'judgePassword', 'rug702'
FROM "Competition" c
WHERE NOT EXISTS (
  SELECT 1 FROM "Setting" s WHERE s."competitionId" = c.id AND s.key = 'judgePassword'
);

-- 2. Live updates. Screens used to subscribe to every row change in Score,
--    HeatCompletion and the checks rows of Setting, for every competition,
--    so a score in one competition made every open screen of every other
--    competition reload. Instead, a change now announces itself on a
--    broadcast channel named after its own competition,
--    "competition:<slug>", which only that competition's screens listen to.
--    The announcement carries no data: screens re-read through the API.
--
--    Statement-level triggers, so a bulk write (a ranking recalculation, an
--    import) is one announcement per competition, not one per row.

CREATE OR REPLACE FUNCTION public.comphq_announce(slugs text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY coalesce(slugs, '{}'::text[]) LOOP
    BEGIN
      PERFORM realtime.send('{}'::jsonb, 'changed', 'competition:' || s, false);
    EXCEPTION WHEN OTHERS THEN
      -- Live updates are a convenience the screens' polling also covers.
      -- A failed announcement must never fail the write that caused it.
      NULL;
    END;
  END LOOP;
END
$$;

-- Not callable through the API: only the triggers below use it.
REVOKE ALL ON FUNCTION public.comphq_announce(text[]) FROM PUBLIC, anon, authenticated;

-- Score and HeatCompletion both reach their competition through the workout.
CREATE OR REPLACE FUNCTION public.comphq_workout_rows_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.comphq_announce(ARRAY(
      SELECT DISTINCT c.slug
      FROM changed r
      JOIN "Workout" w ON w.id = r."workoutId"
      JOIN "Competition" c ON c.id = w."competitionId"
    ));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION public.comphq_checks_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.comphq_announce(ARRAY(
      SELECT DISTINCT c.slug
      FROM changed r
      JOIN "Competition" c ON c.id = r."competitionId"
      WHERE r.key IN ('athleteChecks', 'equipChecks')
    ));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END
$$;

-- A trigger with a transition table covers one event, so each table gets
-- three, all naming the changed rows "changed".
CREATE TRIGGER comphq_score_inserted AFTER INSERT ON "Score"
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.comphq_workout_rows_changed();
CREATE TRIGGER comphq_score_updated AFTER UPDATE ON "Score"
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.comphq_workout_rows_changed();
CREATE TRIGGER comphq_score_deleted AFTER DELETE ON "Score"
  REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.comphq_workout_rows_changed();

CREATE TRIGGER comphq_heat_completion_inserted AFTER INSERT ON "HeatCompletion"
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.comphq_workout_rows_changed();
CREATE TRIGGER comphq_heat_completion_updated AFTER UPDATE ON "HeatCompletion"
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.comphq_workout_rows_changed();
CREATE TRIGGER comphq_heat_completion_deleted AFTER DELETE ON "HeatCompletion"
  REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.comphq_workout_rows_changed();

CREATE TRIGGER comphq_checks_inserted AFTER INSERT ON "Setting"
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.comphq_checks_changed();
CREATE TRIGGER comphq_checks_updated AFTER UPDATE ON "Setting"
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.comphq_checks_changed();
CREATE TRIGGER comphq_checks_deleted AFTER DELETE ON "Setting"
  REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.comphq_checks_changed();
