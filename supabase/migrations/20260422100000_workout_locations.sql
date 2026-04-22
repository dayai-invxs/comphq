CREATE TABLE IF NOT EXISTS "WorkoutLocation" (
  "id"            SERIAL PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "competitionId" INTEGER NOT NULL REFERENCES "Competition"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkoutLocation_name_competitionId_key"
  ON "WorkoutLocation"("name", "competitionId");

ALTER TABLE "Workout"
  ADD COLUMN IF NOT EXISTS "locationId" INTEGER REFERENCES "WorkoutLocation"("id") ON DELETE SET NULL;

ALTER TABLE "WorkoutLocation" ENABLE ROW LEVEL SECURITY;
