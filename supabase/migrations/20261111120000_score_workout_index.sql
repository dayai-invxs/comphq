-- Most score reads are one workout's scores: ranking a workout, the
-- leaderboard per workout, clearing a workout. The only index on "Score" was
-- the unique (athleteId, workoutId) pair, which leads with the athlete and so
-- cannot serve a workout-only lookup: each one read the whole table.
CREATE INDEX IF NOT EXISTS "Score_workoutId_idx" ON "Score"("workoutId");
