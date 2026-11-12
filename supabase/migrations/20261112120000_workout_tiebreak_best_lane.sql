-- A team split across heats (one lane per member) has its lane scores added
-- for the team score, and its lane tiebreaks added the same way. Some
-- workouts instead break ties on the team's best single athlete ("highest
-- individual rep count"). With this on, a split team's tiebreak is its best
-- lane's score, and the tiebreak is ranked the way the score is. Every
-- existing workout keeps adding its tiebreaks.
ALTER TABLE "Workout" ADD COLUMN "tiebreakBestLane" boolean NOT NULL DEFAULT false;
