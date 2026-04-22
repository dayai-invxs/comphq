-- Migrate from hand-rolled NextAuth/User table → Supabase Auth.
--
-- The old User table (id int, username text, password bcrypt, role text)
-- and CompetitionMember(userId int) are replaced with:
--
--   auth.users                 — managed by Supabase Auth
--   UserProfile(id uuid → auth.users.id, role)
--   CompetitionMember(userId uuid → auth.users.id, competitionId, role)
--
-- This is a hard cutover: existing User + CompetitionMember rows are
-- wiped. New admins are created via the Supabase dashboard (Auth → Users
-- → Add user), and competition memberships are inserted manually for
-- that fresh UUID. Per-user passwords and session data are handled by
-- Supabase Auth, not our tables.

-- ─── 1. Drop the old tables (order matters: FK first) ───────────────────
-- AuditLog.userId is INTEGER → User.id today. Retarget to auth.users(id)
-- as UUID. Since there are no rows to preserve (table is empty so far),
-- wipe it as part of the cutover.
TRUNCATE "AuditLog";
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_userId_fkey";
ALTER TABLE "AuditLog" ALTER COLUMN "userId" TYPE UUID USING NULL;
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE SET NULL;

DROP TABLE IF EXISTS "CompetitionMember";
DROP TABLE IF EXISTS "User";

-- ─── 2. UserProfile mirrors auth.users, adds app-specific role ──────────
CREATE TABLE "UserProfile" (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: auto-create a UserProfile row whenever a new auth.users row
-- is inserted. Keeps the two tables in 1:1 alignment without app code.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."UserProfile" (id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ─── 3. CompetitionMember with UUID userId ──────────────────────────────
CREATE TABLE "CompetitionMember" (
  "userId" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "competitionId" INTEGER NOT NULL REFERENCES "Competition"(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'scorekeeper' CHECK (role IN ('admin', 'scorekeeper')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("userId", "competitionId")
);

CREATE INDEX "CompetitionMember_competitionId_idx"
  ON "CompetitionMember"("competitionId");

-- ─── 4. RLS: server service-role bypasses; anon/authenticated get nothing.
-- These tables are only read/written by the server with the service-role key.
ALTER TABLE "UserProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompetitionMember" ENABLE ROW LEVEL SECURITY;
-- (No policies = deny-all to anon and authenticated. Service role bypasses RLS.)
