-- Migrate Workout.heatStartOverrides from text(JSON) to proper jsonb.
--
-- Existing rows hold JSON-encoded objects as text. The USING clause
-- reparses them so the data survives the type change. Default changes
-- from the string '{}' to a real empty jsonb object.

ALTER TABLE "Workout"
  ALTER COLUMN "heatStartOverrides" DROP DEFAULT,
  ALTER COLUMN "heatStartOverrides" TYPE jsonb USING "heatStartOverrides"::jsonb,
  ALTER COLUMN "heatStartOverrides" SET DEFAULT '{}'::jsonb;
