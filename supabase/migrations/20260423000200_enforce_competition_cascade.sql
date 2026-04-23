-- Re-assert ON DELETE CASCADE on every FK from a child table to Competition.
--
-- The original 20260421000000_competition_and_half_weight.sql used
-- `IF NOT EXISTS` guards when adding these FKs. On databases where the
-- FKs had been created previously WITHOUT cascade (e.g. by an older
-- iteration of the schema), the guards short-circuited and the cascade
-- rules were never applied. DELETE on Competition then fails with
-- 23503 because child tables like Workout still have a non-cascading
-- reference.
--
-- This migration drops and re-adds the four Competition-referencing FKs
-- with the correct cascade rules, idempotently.

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT name, child_table FROM (VALUES
      ('Division_competitionId_fkey', 'Division'),
      ('Athlete_competitionId_fkey',  'Athlete'),
      ('Workout_competitionId_fkey',  'Workout'),
      ('Setting_competitionId_fkey',  'Setting')
    ) AS t(name, child_table)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name) THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', c.child_table, c.name);
    END IF;
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE',
      c.child_table, c.name
    );
  END LOOP;
END $$;
