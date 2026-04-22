-- Database-level CHECK constraints. Belt-and-suspenders for input validation.
-- Complements zod validation at the API boundary (landing in a later phase).
--
-- Phase 0 of MVP hardening plan.

-- Workout: positive counts + non-negative time fields + positive number
ALTER TABLE "Workout"
  ADD CONSTRAINT "Workout_lanes_positive_check"              CHECK ("lanes" > 0),
  ADD CONSTRAINT "Workout_number_positive_check"             CHECK ("number" > 0),
  ADD CONSTRAINT "Workout_heatIntervalSecs_positive_check"   CHECK ("heatIntervalSecs" > 0),
  ADD CONSTRAINT "Workout_callTimeSecs_nonneg_check"         CHECK ("callTimeSecs" >= 0),
  ADD CONSTRAINT "Workout_walkoutTimeSecs_nonneg_check"      CHECK ("walkoutTimeSecs" >= 0),
  ADD CONSTRAINT "Workout_timeBetweenHeatsSecs_nonneg_check" CHECK ("timeBetweenHeatsSecs" >= 0);

-- Athlete: non-empty name
ALTER TABLE "Athlete"
  ADD CONSTRAINT "Athlete_name_nonempty_check" CHECK (char_length(trim("name")) > 0);

-- Division: non-empty name + non-negative order
ALTER TABLE "Division"
  ADD CONSTRAINT "Division_name_nonempty_check" CHECK (char_length(trim("name")) > 0),
  ADD CONSTRAINT "Division_order_nonneg_check"  CHECK ("order" >= 0);

-- Score: points is null (unranked) or positive
ALTER TABLE "Score"
  ADD CONSTRAINT "Score_points_positive_check"      CHECK ("points" IS NULL OR "points" > 0),
  ADD CONSTRAINT "Score_partBPoints_positive_check" CHECK ("partBPoints" IS NULL OR "partBPoints" > 0);

-- Competition: non-empty name + slug
ALTER TABLE "Competition"
  ADD CONSTRAINT "Competition_name_nonempty_check" CHECK (char_length(trim("name")) > 0),
  ADD CONSTRAINT "Competition_slug_nonempty_check" CHECK (char_length(trim("slug")) > 0);
