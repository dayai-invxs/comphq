-- Fix: infinite recursion in UserProfile policies.
--
-- The previous migration's USING clauses did
--   EXISTS (SELECT 1 FROM "UserProfile" p WHERE p.id = auth.uid() AND p."isSuper")
-- inside policies on the UserProfile table itself. Each row-check triggered
-- RLS on the inner SELECT, which triggered RLS on its row-check, … ∞.
--
-- Fix: move the "is current user super?" check into a SECURITY DEFINER
-- function. Functions with that attribute run as the owner (postgres
-- superuser) and bypass RLS, breaking the recursion.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."UserProfile"
    WHERE id = auth.uid() AND "isSuper"
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Replace the existing can_manage_competition to use the helper too.
CREATE OR REPLACE FUNCTION public.can_manage_competition(comp_id int)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_super_admin()
      OR EXISTS (
           SELECT 1 FROM public."CompetitionAdmin"
           WHERE "userId" = auth.uid() AND "competitionId" = comp_id
         );
$$;

-- ─── Rewrite the self-referential UserProfile + Competition policies. ───
DROP POLICY IF EXISTS "super_reads_all_profiles" ON "UserProfile";
DROP POLICY IF EXISTS "super_writes_profile" ON "UserProfile";
CREATE POLICY "super_reads_all_profiles" ON "UserProfile"
  FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "super_writes_profile" ON "UserProfile"
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "super_reads_all_admin_rows" ON "CompetitionAdmin";
DROP POLICY IF EXISTS "super_writes_admin_rows" ON "CompetitionAdmin";
DROP POLICY IF EXISTS "super_deletes_admin_rows" ON "CompetitionAdmin";
CREATE POLICY "super_reads_all_admin_rows" ON "CompetitionAdmin"
  FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "super_writes_admin_rows" ON "CompetitionAdmin"
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "super_deletes_admin_rows" ON "CompetitionAdmin"
  FOR DELETE TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "super_writes_competition" ON "Competition";
DROP POLICY IF EXISTS "super_updates_competition" ON "Competition";
DROP POLICY IF EXISTS "super_deletes_competition" ON "Competition";
CREATE POLICY "super_writes_competition" ON "Competition"
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "super_updates_competition" ON "Competition"
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
CREATE POLICY "super_deletes_competition" ON "Competition"
  FOR DELETE TO authenticated USING (public.is_super_admin());
