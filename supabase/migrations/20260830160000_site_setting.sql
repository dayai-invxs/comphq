-- Install-global config. The logo lived in "Setting" under a sentinel
-- competitionId of 0 (v1's defect 8), which this schema's FK to
-- "Competition"(id) refuses — POST /api/logo could never write. A site-wide
-- value does not belong in a per-competition table; it gets its own.
CREATE TABLE IF NOT EXISTS "SiteSetting" (
  "key"   TEXT PRIMARY KEY,
  "value" TEXT NOT NULL
);

ALTER TABLE "SiteSetting" ENABLE ROW LEVEL SECURITY;
