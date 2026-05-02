-- Add role column to CompetitionAdmin to distinguish admins from regular users.
-- Existing rows default to 'admin' to preserve current behavior.
ALTER TABLE "CompetitionAdmin" ADD COLUMN "role" text NOT NULL DEFAULT 'admin';
