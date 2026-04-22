-- SERIAL columns create implicit sequences that require separate USAGE/UPDATE
-- grants. GRANT ALL ON TABLE covers the table but not its sequences.

GRANT ALL ON SEQUENCE "WorkoutEquipment_id_seq" TO service_role;
GRANT ALL ON SEQUENCE "VolunteerRole_id_seq"    TO service_role;
GRANT ALL ON SEQUENCE "Volunteer_id_seq"        TO service_role;
GRANT ALL ON SEQUENCE "WorkoutLocation_id_seq"  TO service_role;
