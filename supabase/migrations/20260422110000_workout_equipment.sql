CREATE TABLE IF NOT EXISTS "WorkoutEquipment" (
  "id"         SERIAL PRIMARY KEY,
  "workoutId"  INTEGER NOT NULL REFERENCES "Workout"("id") ON DELETE CASCADE,
  "divisionId" INTEGER REFERENCES "Division"("id") ON DELETE CASCADE,
  "item"       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "WorkoutEquipment_workoutId_idx" ON "WorkoutEquipment"("workoutId");

ALTER TABLE "WorkoutEquipment" ENABLE ROW LEVEL SECURITY;
