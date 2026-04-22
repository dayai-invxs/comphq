-- Comprehensive service_role grants for all application tables.
-- RLS is enabled on every table; service_role bypasses RLS policies but
-- still requires explicit table-level GRANT in Postgres (error 42501).
-- Granting here covers every table created so far and all their sequences.

GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
