-- Competition Corner import. A competition remembers which Competition
-- Corner event it was set up from and when it last pulled from it; each
-- imported row keeps the id the source gave it, so a re-sync can tell an
-- edited row from a new one even when two athletes share a name.
--
-- Competition Corner stores a workout's Part A and Part B as two workouts;
-- here they are one row, so that row holds both source ids.
--
-- Rows typed in by hand carry no id. The unique indexes skip them.

ALTER TABLE "Competition"
  ADD COLUMN "ccEventId" integer,
  ADD COLUMN "ccSyncedAt" timestamptz;

ALTER TABLE "Division" ADD COLUMN "externalId" text;
ALTER TABLE "Athlete"  ADD COLUMN "externalId" text;
ALTER TABLE "Workout"
  ADD COLUMN "externalId" text,
  ADD COLUMN "externalPartBId" text;

CREATE UNIQUE INDEX "Division_competitionId_externalId_key"
  ON "Division" ("competitionId", "externalId") WHERE "externalId" IS NOT NULL;
CREATE UNIQUE INDEX "Athlete_competitionId_externalId_key"
  ON "Athlete" ("competitionId", "externalId") WHERE "externalId" IS NOT NULL;
CREATE UNIQUE INDEX "Workout_competitionId_externalId_key"
  ON "Workout" ("competitionId", "externalId") WHERE "externalId" IS NOT NULL;
