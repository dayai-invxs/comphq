CREATE TABLE IF NOT EXISTS "Volunteer" (
  "id"            SERIAL PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "competitionId" INTEGER NOT NULL REFERENCES "Competition"("id") ON DELETE CASCADE,
  "roleId"        INTEGER REFERENCES "VolunteerRole"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "Volunteer_competitionId_idx" ON "Volunteer"("competitionId");

ALTER TABLE "Volunteer" ENABLE ROW LEVEL SECURITY;
