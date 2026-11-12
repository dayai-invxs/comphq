-- Knockout consolation heats. With the workout's switch on, everyone who does
-- not advance from a round races once more in that next round's consolation
-- heats, which order them among those who went out in the same round. A
-- consolation lane is an ordinary heat assignment marked as one.
ALTER TABLE "Workout" ADD COLUMN "knockoutConsolation" boolean NOT NULL DEFAULT false;
ALTER TABLE "HeatAssignment" ADD COLUMN "consolation" boolean NOT NULL DEFAULT false;
