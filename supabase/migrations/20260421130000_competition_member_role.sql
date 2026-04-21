-- CompetitionMember + site-wide User.role for tenant isolation.
-- Closes the cross-tenant IDOR landmine flagged in the Phase 2 keystone:
-- every mutation route now gates on (user is member of target competition).
--
-- Phase 2 of MVP hardening plan (COM-6 #1, #2, #6, #7, #18).

-- 1. Site-wide role on User. 'admin' can CRUD competitions + users.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE "User" ADD CONSTRAINT "User_role_check"
  CHECK ("role" IN ('admin', 'user'));

-- 2. Per-competition membership + role.
CREATE TABLE IF NOT EXISTS "CompetitionMember" (
  "id"            SERIAL PRIMARY KEY,
  "userId"        INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "competitionId" INTEGER NOT NULL REFERENCES "Competition"("id") ON DELETE CASCADE,
  "role"          TEXT NOT NULL DEFAULT 'admin',
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "CompetitionMember_role_check" CHECK ("role" IN ('admin', 'scorekeeper'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionMember_userId_competitionId_key"
  ON "CompetitionMember"("userId", "competitionId");
CREATE INDEX IF NOT EXISTS "CompetitionMember_userId_idx"
  ON "CompetitionMember"("userId");
CREATE INDEX IF NOT EXISTS "CompetitionMember_competitionId_idx"
  ON "CompetitionMember"("competitionId");

-- 3. Backfill: every existing user becomes an admin member of every existing
-- competition. Safe default — the single-tenant status quo.
INSERT INTO "CompetitionMember" ("userId", "competitionId", "role")
SELECT u.id, c.id, 'admin'
FROM "User" u
CROSS JOIN "Competition" c
ON CONFLICT DO NOTHING;
