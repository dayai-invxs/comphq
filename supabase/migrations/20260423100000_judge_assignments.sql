CREATE TABLE IF NOT EXISTS "JudgeAssignment" (
  "id"          SERIAL PRIMARY KEY,
  "workoutId"   INTEGER NOT NULL REFERENCES "Workout"("id") ON DELETE CASCADE,
  "volunteerId" INTEGER NOT NULL REFERENCES "Volunteer"("id") ON DELETE CASCADE,
  "heatNumber"  INTEGER NOT NULL,
  "lane"        INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "JudgeAssignment_workoutId_heatNumber_lane_key"
  ON "JudgeAssignment"("workoutId", "heatNumber", "lane");

CREATE UNIQUE INDEX IF NOT EXISTS "JudgeAssignment_workoutId_heatNumber_volunteerId_key"
  ON "JudgeAssignment"("workoutId", "heatNumber", "volunteerId");

CREATE INDEX IF NOT EXISTS "JudgeAssignment_workoutId_idx"
  ON "JudgeAssignment"("workoutId");

ALTER TABLE "JudgeAssignment" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "JudgeAssignment"           TO service_role;
GRANT ALL ON SEQUENCE "JudgeAssignment_id_seq" TO service_role;
