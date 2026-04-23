-- Workout.startTime: TIMESTAMP → TIMESTAMPTZ.
--
-- Stored as `timestamp without time zone`, but the app has always
-- treated the value as a UTC instant (Vercel's Node runtime parses
-- naked-ISO strings as UTC, and every write path calls
-- `new Date(localInput).toISOString()`). That works on the server
-- but round-trips through the browser's TZ on the edit form,
-- shifting the stored wall clock by the editor's UTC offset on
-- every save — showing up as "start times drift after deploys"
-- because admins tend to re-open workouts after a release.
--
-- Converting the column to timestamptz and interpreting existing
-- values as UTC preserves every instant the app currently renders
-- while eliminating the parse ambiguity on both sides.

ALTER TABLE "Workout"
  ALTER COLUMN "startTime" TYPE timestamptz(3)
    USING ("startTime" AT TIME ZONE 'UTC');
