-- Knockout tournament workouts. The score type still says how a heat's
-- results compare (time, reps, weight); "knockout" adds rounds on top:
-- the top N of each heat advance, and the last round is the final.
ALTER TABLE "Workout"
  ADD COLUMN "knockout" boolean NOT NULL DEFAULT false,
  ADD COLUMN "knockoutRounds" integer,
  ADD COLUMN "knockoutAdvance" integer;

-- Each round's heats are ordinary heat assignments marked with their round
-- (null reads as round 1, e.g. heats imported before the tournament began).
-- A knockout lane keeps its own result in rawScore/tiebreakRawScore, which may
-- be capped, and "advanced" records a choice made by hand (null: by score).
ALTER TABLE "HeatAssignment"
  ADD COLUMN "round" integer,
  ADD COLUMN "capped" boolean NOT NULL DEFAULT false,
  ADD COLUMN "advanced" boolean;

-- What the leaderboard shows for a knockout result, e.g. "Out in Round 2 · 1:42".
ALTER TABLE "Score" ADD COLUMN "knockoutLabel" text;
