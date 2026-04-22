-- Some auth.users rows may not have a matching UserProfile row if they
-- were created during the "broken trigger" window between the Phase 1
-- role-drop migration and the 20260422030000 trigger fix. The helper
-- requireSession() defaults isSuper to false when the row is missing,
-- which shows up as "access required" to any user who promoted
-- themselves via SQL but whose UserProfile row never materialized.
--
-- Backfill: ensure every auth.users row has a UserProfile row (isSuper
-- defaults to false; explicit promotions must still be done by a super
-- via the /admin/users UI or a separate UPDATE).

INSERT INTO public."UserProfile" (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;
