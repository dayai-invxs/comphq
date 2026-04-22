CREATE TABLE IF NOT EXISTS "VolunteerRole" (
  "id"            SERIAL PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "competitionId" INTEGER NOT NULL REFERENCES "Competition"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "VolunteerRole_name_competitionId_key"
  ON "VolunteerRole"("name", "competitionId");

ALTER TABLE "VolunteerRole" ENABLE ROW LEVEL SECURITY;
