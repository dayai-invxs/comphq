-- Capped scores. An athlete who does not finish a timed workout inside the time
-- cap has no time to enter, so the score is the work they got done. "capped"
-- says "rawScore" holds rounds and reps (rounds * 10000 + reps) rather than
-- milliseconds, and "partBCapped" says the same of "partBRawScore".
--
-- Every finisher places ahead of every capped athlete, and capped athletes are
-- ordered by most work done. Existing scores are all finished times.
ALTER TABLE "Score"
  ADD COLUMN "capped" boolean NOT NULL DEFAULT false,
  ADD COLUMN "partBCapped" boolean NOT NULL DEFAULT false;

-- A withdrawal used to enter a 0 for every workout the athlete had no score in.
-- On a timed workout that is the fastest possible time, so they ranked first.
-- Score entry never saves a time of 0, so any 0 here is one of those
-- placeholders, including those of athletes since un-withdrawn. They become
-- capped with no work done, which places last. Points are not touched: a
-- completed workout has to be recalculated to pick this up.
UPDATE "Score" s
   SET "capped" = true
  FROM "Workout" w
 WHERE w.id = s."workoutId"
   AND s."rawScore" = 0
   AND w."scoreType" IN ('time', 'lower_is_better');

UPDATE "Score" s
   SET "partBCapped" = true
  FROM "Workout" w
 WHERE w.id = s."workoutId"
   AND s."partBRawScore" = 0
   AND w."partBScoreType" IN ('time', 'lower_is_better');

UPDATE "Score" s
   SET "tiebreakRawScore" = NULL
  FROM "Workout" w
 WHERE w.id = s."workoutId"
   AND s."tiebreakRawScore" = 0
   AND w."tiebreakScoreType" IN ('time', 'lower_is_better');
