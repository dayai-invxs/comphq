-- Grant table-level privileges for tables added after the initial grant migration.
-- service_role bypasses RLS but still needs explicit GRANT in Postgres (42501).

GRANT ALL ON "VolunteerRole"     TO service_role;
GRANT ALL ON "Volunteer"         TO service_role;
GRANT ALL ON "WorkoutLocation"   TO service_role;
GRANT ALL ON "WorkoutEquipment"  TO service_role;
