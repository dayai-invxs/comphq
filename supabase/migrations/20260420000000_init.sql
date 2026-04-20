-- Run this once in the Supabase SQL Editor to create the schema.
-- After running, go to Dashboard → Storage → New bucket → name "logos" → public.

-- DIVISIONS
CREATE TABLE IF NOT EXISTS "Division" (
  "id"    SERIAL PRIMARY KEY,
  "name"  TEXT NOT NULL,
  "order" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Division_name_key" ON "Division"("name");

-- ATHLETES
CREATE TABLE IF NOT EXISTS "Athlete" (
  "id"         SERIAL PRIMARY KEY,
  "name"       TEXT NOT NULL,
  "bibNumber"  TEXT,
  "divisionId" INTEGER REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- WORKOUTS
CREATE TABLE IF NOT EXISTS "Workout" (
  "id"                   SERIAL PRIMARY KEY,
  "number"               INTEGER NOT NULL,
  "name"                 TEXT NOT NULL,
  "scoreType"            TEXT NOT NULL,
  "lanes"                INTEGER NOT NULL,
  "heatIntervalSecs"     INTEGER NOT NULL,
  "timeBetweenHeatsSecs" INTEGER NOT NULL DEFAULT 120,
  "callTimeSecs"         INTEGER NOT NULL,
  "walkoutTimeSecs"      INTEGER NOT NULL,
  "startTime"            TIMESTAMP(3),
  "status"               TEXT NOT NULL DEFAULT 'draft',
  "mixedHeats"           BOOLEAN NOT NULL DEFAULT true,
  "tiebreakEnabled"      BOOLEAN NOT NULL DEFAULT false,
  "partBEnabled"         BOOLEAN NOT NULL DEFAULT false,
  "partBScoreType"       TEXT NOT NULL DEFAULT 'time',
  "heatStartOverrides"   TEXT NOT NULL DEFAULT '{}',
  "completedHeats"       TEXT NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS "Workout_number_key" ON "Workout"("number");

-- HEAT ASSIGNMENTS
CREATE TABLE IF NOT EXISTS "HeatAssignment" (
  "id"         SERIAL PRIMARY KEY,
  "workoutId"  INTEGER NOT NULL REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "athleteId"  INTEGER NOT NULL REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "heatNumber" INTEGER NOT NULL,
  "lane"       INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "HeatAssignment_workoutId_athleteId_key"
  ON "HeatAssignment"("workoutId", "athleteId");

-- USERS
CREATE TABLE IF NOT EXISTS "User" (
  "id"       SERIAL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "password" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

-- SCORES
CREATE TABLE IF NOT EXISTS "Score" (
  "id"               SERIAL PRIMARY KEY,
  "athleteId"        INTEGER NOT NULL REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "workoutId"        INTEGER NOT NULL REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "rawScore"         DOUBLE PRECISION NOT NULL,
  "tiebreakRawScore" DOUBLE PRECISION,
  "points"           INTEGER,
  "partBRawScore"    DOUBLE PRECISION,
  "partBPoints"      INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS "Score_athleteId_workoutId_key"
  ON "Score"("athleteId", "workoutId");

-- SETTINGS (key/value)
CREATE TABLE IF NOT EXISTS "Setting" (
  "key"   TEXT PRIMARY KEY,
  "value" TEXT NOT NULL
);
