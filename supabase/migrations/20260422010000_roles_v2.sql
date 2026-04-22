-- Three-role model cleanup.
--
-- BEFORE:
--   UserProfile(id, role text 'admin'|'user', ...)      — site-wide role string
--   CompetitionMember(userId, competitionId, role ...)  — per-comp role string, 'scorekeeper' unused
--
-- AFTER:
--   UserProfile(id, isSuper boolean, ...)               — just a super-admin flag
--   CompetitionAdmin(userId, competitionId, ...)        — being in this table = admin of that comp
--   Athlete(..., userId uuid null)                       — future linkage for athlete auth (null today)
--
-- Rationale:
--   "admin" was overloaded at two levels (site + comp).
--   'user' and 'scorekeeper' existed in DB but no route read them.
--   Rename clarifies; dropping roles from CompetitionMember leaves the
--   role-distinction hook open in case scorekeeper comes back as a future
--   third role. Athletes are anonymous today but planned to eventually
--   have auth — the nullable userId on Athlete is the claim-your-record
--   hook.

-- ─── 1. UserProfile: role enum → isSuper boolean ────────────────────────
ALTER TABLE "UserProfile" ADD COLUMN "isSuper" BOOLEAN NOT NULL DEFAULT false;
-- Migrate existing data: any user with role='admin' becomes super.
UPDATE "UserProfile" SET "isSuper" = true WHERE role = 'admin';
ALTER TABLE "UserProfile" DROP COLUMN role;

-- ─── 2. CompetitionMember → CompetitionAdmin, drop role ─────────────────
ALTER TABLE "CompetitionMember" RENAME TO "CompetitionAdmin";
ALTER TABLE "CompetitionAdmin" DROP COLUMN role;

-- Rename the index that came with the old table name.
ALTER INDEX IF EXISTS "CompetitionMember_competitionId_idx"
  RENAME TO "CompetitionAdmin_competitionId_idx";

-- ─── 3. Athlete gains optional userId (future: claim-your-record flow) ──
ALTER TABLE "Athlete"
  ADD COLUMN "userId" UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX "Athlete_userId_idx" ON "Athlete"("userId") WHERE "userId" IS NOT NULL;
