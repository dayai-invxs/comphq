-- Schema invariants that carry behavior, plus the two RPCs the heat editor
-- depends on. The plan names these by hand because they are the rules an
-- API layer would otherwise re-derive: a unique index that turns into a
-- 409, a double-click guard, a deferral that makes lane swaps possible.
--
-- The runner wraps this file in a transaction and rolls it back, so the
-- fixtures below need no teardown. Explicit high ids keep the SERIAL
-- sequences free.

-- ─── Fixtures ───────────────────────────────────────────────────────────
INSERT INTO "Competition" (id, name, slug) VALUES
  (910001, 'Constraints A', 'con-a'),
  (910002, 'Constraints B', 'con-b');

INSERT INTO "Division" (id, name, "order", "competitionId") VALUES
  (910001, 'RX', 1, 910001);

INSERT INTO "Athlete" (id, name, "competitionId", "divisionId") VALUES
  (910001, 'Alpha', 910001, 910001),
  (910002, 'Bravo', 910001, 910001),
  (910003, 'Charlie', 910001, 910001);

INSERT INTO "Workout" (id, number, name, "scoreType", lanes,
                       "heatIntervalSecs", "callTimeSecs", "walkoutTimeSecs",
                       "competitionId") VALUES
  (910001, 1, 'WOD 1', 'time', 6, 600, 120, 60, 910001),
  (910002, 2, 'WOD 2', 'reps', 6, 600, 120, 60, 910001),
  (910003, 1, 'B WOD 1', 'time', 6, 600, 120, 60, 910002);

INSERT INTO "Volunteer" (id, name, "competitionId") VALUES
  (910001, 'Judge One', 910001),
  (910002, 'Judge Two', 910001);

-- ─── HeatAssignment: lane uniqueness is DEFERRABLE INITIALLY DEFERRED ────
-- The reorder RPC moves several athletes in one statement, which passes
-- through states where two rows briefly hold the same lane. A plain unique
-- index rejects that as each row version hits the index; a deferrable one
-- queues the check instead. This is why the constraint is declared the way
-- it is, so the declaration itself is asserted first.
SELECT test.ok(
  (SELECT condeferrable AND condeferred FROM pg_constraint
    WHERE conname = 'heat_assignment_lane_unique'),
  'heat_assignment_lane_unique is DEFERRABLE INITIALLY DEFERRED'
);

INSERT INTO "HeatAssignment" (id, "workoutId", "athleteId", "heatNumber", lane) VALUES
  (910001, 910001, 910001, 1, 1),
  (910002, 910001, 910002, 1, 2);

-- Two separate statements leaving a duplicate behind. Deferred, so neither
-- one errors: the check is owed at COMMIT, which this file never reaches.
SELECT test.ok(
  NOT test.rejects($$UPDATE "HeatAssignment" SET lane = 1 WHERE id = 910002$$),
  'duplicate lane is accepted while the check is deferred'
);

-- Forcing the check proves it is real rather than absent.
SELECT test.ok(
  test.rejects($$SET CONSTRAINTS heat_assignment_lane_unique IMMEDIATE$$),
  'SET CONSTRAINTS IMMEDIATE raises on the pending duplicate'
);

UPDATE "HeatAssignment" SET lane = 2 WHERE id = 910002;

-- A non-deferrable unique index cannot do what the reorder RPC needs. This
-- is the counterfactual: same swap, same single statement, different
-- constraint kind.
CREATE TEMP TABLE lane_swap_probe (id INT PRIMARY KEY, lane INT);
CREATE UNIQUE INDEX lane_swap_probe_lane ON lane_swap_probe (lane);
INSERT INTO lane_swap_probe VALUES (1, 1), (2, 2);
SELECT test.ok(
  test.rejects($$UPDATE lane_swap_probe p SET lane = u.lane
                   FROM (VALUES (1, 2), (2, 1)) AS u(id, lane)
                  WHERE p.id = u.id$$),
  'a non-deferrable unique index rejects an in-statement lane swap'
);

-- ─── HeatAssignment: one row per athlete per workout ─────────────────────
SELECT test.ok(
  test.rejects($$INSERT INTO "HeatAssignment" ("workoutId", "athleteId", "heatNumber", lane)
                 VALUES (910001, 910001, 2, 4)$$),
  'HeatAssignment rejects a second row for the same (workoutId, athleteId)'
);
SELECT test.ok(
  NOT test.rejects($$INSERT INTO "HeatAssignment" ("workoutId", "athleteId", "heatNumber", lane)
                     VALUES (910002, 910001, 1, 1)$$),
  'HeatAssignment accepts the same athlete in a different workout'
);

-- ─── Score: one score per athlete per workout ────────────────────────────
INSERT INTO "Score" ("athleteId", "workoutId", "rawScore") VALUES (910001, 910001, 120);
SELECT test.ok(
  test.rejects($$INSERT INTO "Score" ("athleteId", "workoutId", "rawScore")
                 VALUES (910001, 910001, 130)$$),
  'Score rejects a second row for the same (athleteId, workoutId)'
);
SELECT test.ok(
  NOT test.rejects($$INSERT INTO "Score" ("athleteId", "workoutId", "rawScore")
                     VALUES (910001, 910002, 130)$$),
  'Score accepts the same athlete in a different workout'
);

-- ─── HeatCompletion: the double-click guard ──────────────────────────────
-- Two clicks on "complete heat" race each other. The unique index is what
-- makes the second one lose instead of inserting a duplicate.
INSERT INTO "HeatCompletion" ("workoutId", "heatNumber") VALUES (910001, 1);
SELECT test.ok(
  test.rejects($$INSERT INTO "HeatCompletion" ("workoutId", "heatNumber")
                 VALUES (910001, 1)$$),
  'HeatCompletion rejects a repeat completion of the same heat'
);
SELECT test.ok(
  NOT test.rejects($$INSERT INTO "HeatCompletion" ("workoutId", "heatNumber")
                     VALUES (910001, 2)$$),
  'HeatCompletion accepts the next heat of the same workout'
);

-- ─── Workout: number is unique per competition, the source of the 409 ────
SELECT test.ok(
  test.rejects($$INSERT INTO "Workout" (number, name, "scoreType", lanes,
                   "heatIntervalSecs", "callTimeSecs", "walkoutTimeSecs", "competitionId")
                 VALUES (1, 'Clash', 'time', 6, 600, 120, 60, 910001)$$),
  'Workout rejects a duplicate number within one competition'
);
SELECT test.ok(
  NOT test.rejects($$INSERT INTO "Workout" (number, name, "scoreType", lanes,
                       "heatIntervalSecs", "callTimeSecs", "walkoutTimeSecs", "competitionId")
                     VALUES (2, 'Fine', 'time', 6, 600, 120, 60, 910002)$$),
  'Workout accepts the same number in a different competition'
);

-- ─── JudgeAssignment: one judge per lane, one lane per judge ─────────────
INSERT INTO "JudgeAssignment" ("workoutId", "volunteerId", "heatNumber", lane)
  VALUES (910001, 910001, 1, 1);
SELECT test.ok(
  test.rejects($$INSERT INTO "JudgeAssignment" ("workoutId", "volunteerId", "heatNumber", lane)
                 VALUES (910001, 910002, 1, 1)$$),
  'JudgeAssignment rejects two judges on one lane of a heat'
);
SELECT test.ok(
  test.rejects($$INSERT INTO "JudgeAssignment" ("workoutId", "volunteerId", "heatNumber", lane)
                 VALUES (910001, 910001, 1, 2)$$),
  'JudgeAssignment rejects one judge on two lanes of a heat'
);
SELECT test.ok(
  NOT test.rejects($$INSERT INTO "JudgeAssignment" ("workoutId", "volunteerId", "heatNumber", lane)
                     VALUES (910001, 910001, 2, 1)$$),
  'JudgeAssignment accepts the same judge in the next heat'
);

-- ─── RLS helpers ─────────────────────────────────────────────────────────
-- SECURITY DEFINER lets a policy consult CompetitionAdmin without the
-- caller being able to read it; SET search_path = '' is what stops the
-- helper from re-entering the policies that call it, which is the
-- recursion v1 hit.
SELECT test.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('is_super_admin', 'can_manage_competition', 'can_manage_workout')
      AND p.prosecdef
      AND 'search_path=""' = ANY(p.proconfig)) = 3,
  $$all three RLS helpers are SECURITY DEFINER with search_path = ''$$
);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000011', 'con-super@test.local'),
  ('00000000-0000-4000-8000-000000000012', 'con-admin@test.local');
UPDATE "UserProfile" SET "isSuper" = true
  WHERE id = '00000000-0000-4000-8000-000000000011';
INSERT INTO "CompetitionAdmin" ("userId", "competitionId")
  VALUES ('00000000-0000-4000-8000-000000000012', 910001);

SELECT test.as_user('00000000-0000-4000-8000-000000000012');
SELECT test.ok(NOT is_super_admin(), 'is_super_admin is false for a competition admin');
SELECT test.ok(can_manage_competition(910001), 'can_manage_competition: own competition');
SELECT test.ok(NOT can_manage_competition(910002), 'can_manage_competition: other competition');
-- can_manage_workout resolves the workout's competition, so admin rights
-- reach every workout of a competition without being granted per workout.
SELECT test.ok(can_manage_workout(910001), 'can_manage_workout: workout of own competition');
SELECT test.ok(NOT can_manage_workout(910003), 'can_manage_workout: workout of other competition');

SELECT test.as_user('00000000-0000-4000-8000-000000000011');
SELECT test.ok(is_super_admin(), 'is_super_admin is true for a super admin');
SELECT test.ok(can_manage_competition(910002), 'super admin can manage any competition');

SELECT test.as_anon();
SELECT test.ok(NOT is_super_admin(), 'is_super_admin is false for anon');
SELECT test.ok(NOT can_manage_competition(910001), 'can_manage_competition is false for anon');
RESET ROLE;

-- ─── replace_workout_heat_assignments ────────────────────────────────────
-- Whole-workout swap: delete everything for the workout, insert the given
-- set, and drop the per-heat start overrides because the heats they named
-- may no longer exist.
UPDATE "Workout" SET "heatStartOverrides" = '{"1": "2026-01-01T10:00:00Z"}'
  WHERE id = 910001;

SELECT replace_workout_heat_assignments(910001, '[
  {"athleteId": 910003, "heatNumber": 1, "lane": 5},
  {"athleteId": 910002, "heatNumber": 1, "lane": 6}
]'::jsonb);

SELECT test.ok(
  (SELECT count(*) FROM "HeatAssignment" WHERE "workoutId" = 910001) = 2,
  'replace: the workout holds only the assignments just given'
);
SELECT test.ok(
  (SELECT lane FROM "HeatAssignment"
    WHERE "workoutId" = 910001 AND "athleteId" = 910003) = 5,
  'replace: inserted rows carry the given heat and lane'
);
SELECT test.ok(
  (SELECT "heatStartOverrides" FROM "Workout" WHERE id = 910001) = '{}'::jsonb,
  'replace: heatStartOverrides is reset'
);
SELECT test.ok(
  (SELECT count(*) FROM "HeatAssignment" WHERE "workoutId" = 910002) = 1,
  'replace: another workout keeps its assignments'
);

SELECT replace_workout_heat_assignments(910001, '[]'::jsonb);
SELECT test.ok(
  (SELECT count(*) FROM "HeatAssignment" WHERE "workoutId" = 910001) = 0,
  'replace: an empty array clears the workout'
);

-- ─── reorder_workout_assignments ─────────────────────────────────────────
INSERT INTO "HeatAssignment" (id, "workoutId", "athleteId", "heatNumber", lane) VALUES
  (910011, 910001, 910001, 1, 1),
  (910012, 910001, 910002, 1, 2),
  (910013, 910001, 910003, 2, 1);

-- The swap the deferral exists for: both rows change lane in one UPDATE,
-- so the pair is momentarily doubled up on lane 1.
SELECT reorder_workout_assignments(910001, '[
  {"id": 910011, "heatNumber": 1, "lane": 2},
  {"id": 910012, "heatNumber": 1, "lane": 1}
]'::jsonb);
SELECT test.ok(
  (SELECT lane FROM "HeatAssignment" WHERE id = 910011) = 2
  AND (SELECT lane FROM "HeatAssignment" WHERE id = 910012) = 1,
  'reorder: two athletes swap lanes in one call'
);

SELECT reorder_workout_assignments(910001, '[
  {"id": 910013, "heatNumber": 3, "lane": 4}
]'::jsonb);
SELECT test.ok(
  (SELECT "heatNumber" FROM "HeatAssignment" WHERE id = 910013) = 3,
  'reorder: an athlete moves to another heat'
);

-- The workoutId guard in the WHERE clause. A caller that names a row from
-- a different workout changes nothing rather than moving it.
SELECT reorder_workout_assignments(910002, '[
  {"id": 910011, "heatNumber": 9, "lane": 9}
]'::jsonb);
SELECT test.ok(
  (SELECT "heatNumber" FROM "HeatAssignment" WHERE id = 910011) = 1,
  'reorder: ignores ids belonging to another workout'
);

SELECT test.ok(
  NOT test.rejects($$SELECT reorder_workout_assignments(910001, '[]'::jsonb)$$),
  'reorder: an empty array is a no-op'
);

-- ─── The RPCs run as the caller, so RLS still applies ────────────────────
-- Neither is SECURITY DEFINER. That is what keeps them from being a hole
-- around the policies: anon calling replace does not get to wipe a heat.
SELECT test.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('replace_workout_heat_assignments', 'reorder_workout_assignments')
      AND NOT p.prosecdef) = 2,
  'both RPCs are SECURITY INVOKER'
);

SELECT test.as_anon();
SELECT test.ok(
  test.rejects($$SELECT replace_workout_heat_assignments(910001, '[
    {"athleteId": 910001, "heatNumber": 1, "lane": 1}
  ]'::jsonb)$$),
  'anon calling replace is denied by the INSERT policy'
);
RESET ROLE;
SELECT test.ok(
  (SELECT count(*) FROM "HeatAssignment" WHERE "workoutId" = 910001) = 3,
  'anon calling replace left the existing assignments in place'
);
