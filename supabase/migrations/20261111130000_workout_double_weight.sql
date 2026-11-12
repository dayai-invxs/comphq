-- A double-weight workout counts twice on the overall leaderboard: its place
-- (and Part B's) is doubled, the mirror of halfWeight. A workout is one or
-- the other, never both; the API keeps them apart. Every existing workout
-- counts once.
ALTER TABLE "Workout" ADD COLUMN "doubleWeight" boolean NOT NULL DEFAULT false;
