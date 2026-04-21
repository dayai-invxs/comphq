-- AuditLog table for tracking user mutations.
-- Populated via src/lib/audit.ts#logAudit, wired into routes in Phase 2.
--
-- Phase 0 of MVP hardening plan (COM-15).

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"            BIGSERIAL PRIMARY KEY,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "userId"        INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
  "userName"      TEXT,
  "competitionId" INTEGER REFERENCES "Competition"("id") ON DELETE SET NULL,
  "action"        TEXT NOT NULL,
  "resourceType"  TEXT NOT NULL,
  "resourceId"    TEXT,
  "diff"          JSONB
);

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx"     ON "AuditLog"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_competitionId_idx" ON "AuditLog"("competitionId");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx"        ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_resource_idx"      ON "AuditLog"("resourceType", "resourceId");

-- Helpful search index for action strings (supports LIKE 'athlete.%').
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx"        ON "AuditLog"("action");
