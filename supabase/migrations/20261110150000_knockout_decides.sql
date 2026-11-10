-- A knockout run as the competition's last workout can decide it outright:
-- once the tournament is finished, the leaderboard ranks each division by the
-- tournament's final placings alone, ignoring every earlier workout's points.
ALTER TABLE "Workout" ADD COLUMN "knockoutDecides" boolean NOT NULL DEFAULT false;
