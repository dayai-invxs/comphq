-- RLS policy matrix. Ported from v1's src/lib/rls.integration.test.ts,
-- which drove a hosted Supabase project through supabase-js. Same 17
-- cases, same order, expressed against the database directly so the suite
-- runs without a backend.
--
-- Matrix for each protected table:
--   anon        — cannot insert/update/delete
--   authed-none — authenticated, zero membership: cannot write
--   comp-admin  — CompetitionAdmin of comp A: writes A, not B
--   super       — UserProfile.isSuper: writes any comp
--
-- The runner wraps this file in a transaction and rolls it back, so the
-- fixtures below need no teardown.

-- ─── Fixtures ───────────────────────────────────────────────────────────
-- Explicit high ids keep the SERIAL sequences free for rows the tests
-- insert themselves.
INSERT INTO "Competition" (id, name, slug) VALUES
  (900001, 'RLS A', 'rls-a'),
  (900002, 'RLS B', 'rls-b');

-- UserProfile rows appear via the on_auth_user_created trigger.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000001', 'rls-super@test.local'),
  ('00000000-0000-4000-8000-000000000002', 'rls-admin@test.local'),
  ('00000000-0000-4000-8000-000000000003', 'rls-none@test.local');

SELECT test.ok(
  (SELECT count(*) FROM "UserProfile"
    WHERE id::text LIKE '00000000-0000-4000-8000-%') = 3,
  'trigger creates a UserProfile row for every auth.users insert'
);

UPDATE "UserProfile" SET "isSuper" = true
  WHERE id = '00000000-0000-4000-8000-000000000001';

INSERT INTO "CompetitionAdmin" ("userId", "competitionId")
  VALUES ('00000000-0000-4000-8000-000000000002', 900001);

-- One secret row and the two check rows, so the scoped Setting policy below
-- is proved against both kinds at once.
INSERT INTO "Setting" ("competitionId", key, value) VALUES
  (900001, 'judgePassword', 'rls-secret'),
  (900001, 'athleteChecks', '{}'),
  (900001, 'equipChecks', '{}');

-- ─── Competition ────────────────────────────────────────────────────────
SELECT test.as_anon();
SELECT test.ok(
  test.denied($$INSERT INTO "Competition" (name, slug) VALUES ('X', 'rls-x')$$),
  'Competition: anon cannot INSERT'
);

SELECT test.as_user('00000000-0000-4000-8000-000000000002');
SELECT test.ok(
  test.denied($$INSERT INTO "Competition" (name, slug) VALUES ('X', 'rls-x')$$),
  'Competition: authed non-super cannot INSERT'
);

SELECT test.as_user('00000000-0000-4000-8000-000000000001');
SELECT test.ok(
  test.allowed($$INSERT INTO "Competition" (name, slug) VALUES ('S', 'rls-super')$$),
  'Competition: super CAN INSERT'
);

-- ─── Per-competition tables ─────────────────────────────────────────────
SELECT test.as_anon();
SELECT test.ok(
  test.denied($$INSERT INTO "Athlete" (name, "competitionId") VALUES ('Ghost', 900001)$$),
  'Athlete: anon cannot INSERT'
);

SELECT test.as_user('00000000-0000-4000-8000-000000000003');
SELECT test.ok(
  test.denied($$INSERT INTO "Athlete" (name, "competitionId") VALUES ('Ghost', 900001)$$),
  'Athlete: authed non-member cannot INSERT'
);

SELECT test.as_user('00000000-0000-4000-8000-000000000002');
SELECT test.ok(
  test.allowed($$INSERT INTO "Athlete" (name, "competitionId") VALUES ('CompA Ath', 900001)$$),
  'Athlete: comp-admin-of-A CAN INSERT for comp A'
);
SELECT test.ok(
  test.denied($$INSERT INTO "Athlete" (name, "competitionId") VALUES ('CompB Ath', 900002)$$),
  'Athlete: comp-admin-of-A CANNOT INSERT for comp B'
);

SELECT test.as_user('00000000-0000-4000-8000-000000000001');
SELECT test.ok(
  test.allowed($$INSERT INTO "Athlete" (name, "competitionId") VALUES ('Super A', 900001)$$),
  'Athlete: super CAN INSERT for comp A'
);
SELECT test.ok(
  test.allowed($$INSERT INTO "Athlete" (name, "competitionId") VALUES ('Super B', 900002)$$),
  'Athlete: super CAN INSERT for comp B'
);

-- ─── UserProfile ────────────────────────────────────────────────────────
SELECT test.as_user('00000000-0000-4000-8000-000000000003');
SELECT test.ok(
  test.visible($$SELECT id FROM "UserProfile"
                  WHERE id = '00000000-0000-4000-8000-000000000003'$$) = 1,
  'UserProfile: user reads own row'
);
-- RLS filters silently rather than erroring — the row is simply not there.
SELECT test.ok(
  test.visible($$SELECT id FROM "UserProfile"
                  WHERE id = '00000000-0000-4000-8000-000000000002'$$) = 0,
  'UserProfile: user CANNOT read another user''s row'
);

SELECT test.as_user('00000000-0000-4000-8000-000000000001');
SELECT test.ok(
  test.visible($$SELECT id FROM "UserProfile"$$) >= 3,
  'UserProfile: super reads all rows'
);

-- ─── CompetitionAdmin ───────────────────────────────────────────────────
SELECT test.as_user('00000000-0000-4000-8000-000000000002');
SELECT test.ok(
  test.visible($$SELECT * FROM "CompetitionAdmin"
                  WHERE "userId" = '00000000-0000-4000-8000-000000000002'$$) = 1,
  'CompetitionAdmin: user sees their own rows'
);

SELECT test.as_user('00000000-0000-4000-8000-000000000003');
SELECT test.ok(
  test.visible($$SELECT * FROM "CompetitionAdmin"
                  WHERE "userId" = '00000000-0000-4000-8000-000000000002'$$) = 0,
  'CompetitionAdmin: user CANNOT see another user''s rows'
);

SELECT test.as_user('00000000-0000-4000-8000-000000000001');
SELECT test.ok(
  test.visible($$SELECT * FROM "CompetitionAdmin"$$) >= 1,
  'CompetitionAdmin: super reads all rows'
);

SELECT test.as_user('00000000-0000-4000-8000-000000000002');
SELECT test.ok(
  test.denied($$INSERT INTO "CompetitionAdmin" ("userId", "competitionId")
                VALUES ('00000000-0000-4000-8000-000000000003', 900001)$$),
  'CompetitionAdmin: non-super CANNOT INSERT'
);

SELECT test.as_user('00000000-0000-4000-8000-000000000001');
SELECT test.ok(
  test.allowed($$INSERT INTO "CompetitionAdmin" ("userId", "competitionId")
                 VALUES ('00000000-0000-4000-8000-000000000003', 900002)$$),
  'CompetitionAdmin: super CAN INSERT'
);

-- ─── DEFECT (v1, ported as-is): tables with RLS on and no policy at all ──
-- Plan item 5 in "v1 defects — log, do not fix". These tables enable row
-- level security but never define a policy of any kind, so deny-all is
-- what a competition admin gets too — the server's service key is the only
-- thing that can touch them. Locked here so the gap stays visible rather
-- than being mistaken for a porting slip.
--
-- The set is asserted as a whole rather than table by table: a new table
-- that ships with RLS on and no policy should turn this red, since that is
-- almost always an oversight rather than a decision.
SELECT test.ok(
  (SELECT array_agg(c.relname::text ORDER BY c.relname)
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))
  = ARRAY['AuditLog', 'JudgeAssignment', 'Volunteer', 'VolunteerRole',
          'WorkoutEquipment', 'WorkoutLocation'],
  'DEFECT: exactly six tables have RLS on with no policy at all'
);

SELECT test.as_user('00000000-0000-4000-8000-000000000002');
SELECT test.ok(
  test.denied($$INSERT INTO "VolunteerRole" (name, "competitionId") VALUES ('Judge', 900001)$$),
  'DEFECT: comp admin cannot INSERT VolunteerRole — no write policy exists'
);
SELECT test.ok(
  test.denied($$INSERT INTO "Volunteer" (name, "competitionId") VALUES ('V', 900001)$$),
  'DEFECT: comp admin cannot INSERT Volunteer — no write policy exists'
);
SELECT test.ok(
  test.denied($$INSERT INTO "WorkoutLocation" (name, "competitionId") VALUES ('Floor', 900001)$$),
  'DEFECT: comp admin cannot INSERT WorkoutLocation — no write policy exists'
);

-- Those tables are equally unreadable to anon, because enabling RLS
-- without a SELECT policy denies reads as well.
SELECT test.as_anon();
SELECT test.ok(
  test.visible($$SELECT * FROM "Volunteer"$$) = 0,
  'DEFECT: anon reads zero Volunteer rows — RLS on, no SELECT policy'
);

-- ─── Public read surface ────────────────────────────────────────────────
SELECT test.as_anon();
SELECT test.ok(
  test.visible($$SELECT * FROM "Competition" WHERE id = 900001$$) = 1,
  'anon CAN read Competition'
);
-- Setting is admin-only except the two rows the checks realtime channel
-- rides on (migration 20260830120000_realtime_checks.sql). The content of
-- those two is public through GET /api/checks already; judgePassword and
-- every other key must stay invisible.
SELECT test.ok(
  test.visible($$SELECT * FROM "Setting" WHERE key IN ('athleteChecks', 'equipChecks')$$) = 2,
  'anon CAN read the two checks rows of Setting — the realtime channel rides on them'
);
SELECT test.ok(
  test.visible($$SELECT * FROM "Setting" WHERE key NOT IN ('athleteChecks', 'equipChecks')$$) = 0,
  'anon reads no other Setting row — judgePassword stays invisible'
);

SELECT test.as_service();
