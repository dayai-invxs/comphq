-- Multi-competition refactor + halfWeight on Workout.
-- Backfills all existing data under a single default "Default Competition" (slug: default).

-- 1. Competition table
CREATE TABLE IF NOT EXISTS "Competition" (
  "id"   SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Competition_slug_key" ON "Competition"("slug");

-- 2. Seed a default competition to backfill existing rows
INSERT INTO "Competition" ("name", "slug")
VALUES ('Default Competition', 'default')
ON CONFLICT DO NOTHING;

-- 3. Add competitionId columns (nullable for backfill)
ALTER TABLE "Division" ADD COLUMN IF NOT EXISTS "competitionId" INTEGER;
ALTER TABLE "Athlete"  ADD COLUMN IF NOT EXISTS "competitionId" INTEGER;
ALTER TABLE "Workout"  ADD COLUMN IF NOT EXISTS "competitionId" INTEGER;
ALTER TABLE "Setting"  ADD COLUMN IF NOT EXISTS "competitionId" INTEGER;

-- 4. Backfill existing rows to the default competition
UPDATE "Division" SET "competitionId" = (SELECT id FROM "Competition" WHERE slug = 'default') WHERE "competitionId" IS NULL;
UPDATE "Athlete"  SET "competitionId" = (SELECT id FROM "Competition" WHERE slug = 'default') WHERE "competitionId" IS NULL;
UPDATE "Workout"  SET "competitionId" = (SELECT id FROM "Competition" WHERE slug = 'default') WHERE "competitionId" IS NULL;
UPDATE "Setting"  SET "competitionId" = (SELECT id FROM "Competition" WHERE slug = 'default') WHERE "competitionId" IS NULL;

-- 5. Enforce NOT NULL + FK
ALTER TABLE "Division" ALTER COLUMN "competitionId" SET NOT NULL;
ALTER TABLE "Athlete"  ALTER COLUMN "competitionId" SET NOT NULL;
ALTER TABLE "Workout"  ALTER COLUMN "competitionId" SET NOT NULL;
ALTER TABLE "Setting"  ALTER COLUMN "competitionId" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Division_competitionId_fkey') THEN
    ALTER TABLE "Division" ADD CONSTRAINT "Division_competitionId_fkey"
      FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Athlete_competitionId_fkey') THEN
    ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_competitionId_fkey"
      FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Workout_competitionId_fkey') THEN
    ALTER TABLE "Workout" ADD CONSTRAINT "Workout_competitionId_fkey"
      FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Setting_competitionId_fkey') THEN
    ALTER TABLE "Setting" ADD CONSTRAINT "Setting_competitionId_fkey"
      FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 6. Replace single-column unique indexes with composite per-competition
DROP INDEX IF EXISTS "Division_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Division_competitionId_name_key" ON "Division"("competitionId", "name");

DROP INDEX IF EXISTS "Workout_number_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Workout_competitionId_number_key" ON "Workout"("competitionId", "number");

-- Setting: swap PK from (key) to (competitionId, key)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Setting_pkey') THEN
    ALTER TABLE "Setting" DROP CONSTRAINT "Setting_pkey";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Setting_pkey_composite') THEN
    ALTER TABLE "Setting" ADD CONSTRAINT "Setting_pkey_composite" PRIMARY KEY ("competitionId", "key");
  END IF;
END $$;

-- 7. halfWeight flag on Workout
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "halfWeight" BOOLEAN NOT NULL DEFAULT false;
