-- "Highest score" competitions give 1st place a set number of points and each
-- place after it a set number fewer. A workout may use its own gap between
-- places instead; null keeps the competition's. Rank-scored competitions
-- ignore it. Every existing workout keeps the competition's gap.
ALTER TABLE "Workout" ADD COLUMN "pointsStep" integer;
