-- A team placed in more than one heat of a workout has one member in each
-- lane. Each lane's own score is kept here; the team's Score row holds their
-- sum. Null on every lane of a team that is placed only once.
ALTER TABLE "HeatAssignment"
  ADD COLUMN "rawScore" double precision,
  ADD COLUMN "tiebreakRawScore" double precision,
  ADD COLUMN "partBRawScore" double precision;
