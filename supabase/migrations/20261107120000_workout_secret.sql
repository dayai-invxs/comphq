-- A secret workout is kept off the public Workouts screen until it goes
-- active, so its name and description are not known ahead of the reveal.
-- Every existing workout is not secret.
ALTER TABLE "Workout" ADD COLUMN "secret" boolean NOT NULL DEFAULT false;
