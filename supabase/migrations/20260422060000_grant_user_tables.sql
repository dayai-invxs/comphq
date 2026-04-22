-- UserProfile and CompetitionAdmin were created with RLS enabled but
-- without explicit GRANTs. In Postgres, service_role bypasses RLS but
-- still needs table-level privileges. Without these GRANTs the server
-- gets 42501 ("permission denied for table UserProfile") on every
-- /api/me call — so isSuper silently reads as false and super-admins
-- can't access /admin.
--
-- Also grant the minimum needed to `authenticated` so the existing RLS
-- policies (added in 20260422020000_rls_admin_writes.sql) can actually
-- do their SELECTs.

GRANT ALL ON "UserProfile" TO service_role;
GRANT SELECT, UPDATE ON "UserProfile" TO authenticated;

GRANT ALL ON "CompetitionAdmin" TO service_role;
GRANT SELECT ON "CompetitionAdmin" TO authenticated;
