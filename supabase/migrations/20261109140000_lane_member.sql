-- Which team member runs a split team's lane. Display only: scoring never
-- reads it. Cleared when the member is removed (a roster re-upload replaces
-- the member list, so picks are made again after one).
ALTER TABLE "HeatAssignment"
  ADD COLUMN "teamMemberId" integer REFERENCES "TeamMember"(id) ON DELETE SET NULL ON UPDATE CASCADE;
