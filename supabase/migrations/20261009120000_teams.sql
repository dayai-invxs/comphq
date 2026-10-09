-- Teams. A team competes as one "Athlete" row: it takes one lane, gets one
-- score per workout and one leaderboard rank, exactly like an individual, so
-- heats, scoring and the leaderboard do not change. The people on it are
-- "TeamMember" rows under that athlete. They are names on a list, never
-- competitors of their own, so heat generation cannot place them.
--
-- A team with no members is valid and competes normally.
--
-- A division says what an entry in it should look like: how many athletes,
-- and optionally how many men and women. Individual divisions are teamSize 1.
-- An entry that does not match is warned about, never refused.
--
-- Members are scoped to one competition. If people are ever tracked across
-- events, a global person table and a nullable "personId" here is the way in;
-- "externalId" keeps Competition Corner's participant id to match them on.

ALTER TABLE "Division"
  ADD COLUMN "teamSize"   integer NOT NULL DEFAULT 1 CHECK ("teamSize" >= 1),
  ADD COLUMN "menCount"   integer CHECK ("menCount" >= 0),
  ADD COLUMN "womenCount" integer CHECK ("womenCount" >= 0);

-- An individual's gender. Left blank on a team; its members carry their own.
ALTER TABLE "Athlete"
  ADD COLUMN "gender" text CHECK ("gender" IN ('male', 'female'));

CREATE TABLE IF NOT EXISTS "TeamMember" (
  "id"         SERIAL PRIMARY KEY,
  "athleteId"  INTEGER NOT NULL REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name"       TEXT NOT NULL,
  "gender"     TEXT CHECK ("gender" IN ('male', 'female')),
  "order"      INTEGER NOT NULL DEFAULT 0,
  "externalId" TEXT
);

CREATE INDEX IF NOT EXISTS "TeamMember_athleteId_idx" ON "TeamMember"("athleteId");

ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "TeamMember" TO service_role;
GRANT ALL ON SEQUENCE "TeamMember_id_seq" TO service_role;

-- Existing athletes get a gender only where their division's name says it
-- plainly ("Individual Women", "Scaled Men"). Anything that reads like a team
-- division is left alone, and so is anything ambiguous.
UPDATE "Athlete" a SET "gender" = 'female'
  FROM "Division" d
  WHERE d."id" = a."divisionId" AND a."gender" IS NULL
    AND d."name" ~* '\m(women|woman|female|ladies|girls)\M'
    AND d."name" !~* '\m(men|man|male|guys|boys)\M'
    AND d."name" !~* '\m(team|teams|pair|pairs|partner|partners|duo|trio|mixed)\M';

UPDATE "Athlete" a SET "gender" = 'male'
  FROM "Division" d
  WHERE d."id" = a."divisionId" AND a."gender" IS NULL
    AND d."name" ~* '\m(men|man|male|guys|boys)\M'
    AND d."name" !~* '\m(women|woman|female|ladies|girls)\M'
    AND d."name" !~* '\m(team|teams|pair|pairs|partner|partners|duo|trio|mixed)\M';
