-- The golden-master fixture: one competition, seeded identically into a v1
-- database and a v3 database, so the read endpoints can be diffed.
--
-- Everything is explicit. No now(), no random ids, no reliance on insert
-- order — two runs a week apart must produce byte-identical output, or the
-- differential is measuring the clock instead of the code.
--
-- The shape is chosen to exercise the rules that carry behaviour rather
-- than to look like a real event: a withdrawn athlete, an athlete with no
-- division, DNS gaps, a half-weight workout, a Part A/Part B workout that
-- is still running, a lower_is_better workout named as the designated
-- tiebreaker, equipment that applies to one division and equipment that
-- applies to all, and a volunteer who is not a judge.

TRUNCATE "Setting", "Score", "HeatCompletion", "HeatAssignment",
         "JudgeAssignment", "WorkoutEquipment", "Volunteer", "VolunteerRole",
         "Workout", "WorkoutLocation", "Athlete", "Division", "Competition"
  RESTART IDENTITY CASCADE;

INSERT INTO "Competition" (id, name, slug) VALUES (1, 'Golden Master', 'golden');

INSERT INTO "Division" (id, name, "order", "competitionId") VALUES
  (1, 'Rx',     1, 1),
  (2, 'Scaled', 2, 1);

-- Finn has no division; Gus is withdrawn. Both are load-bearing: division
-- specific equipment must skip Finn, and heat generation must still include
-- Gus, since v1 does not filter withdrawn athletes out.
INSERT INTO "Athlete" (id, name, "bibNumber", "divisionId", "competitionId", "userId", withdrawn) VALUES
  (1, 'Alice Adams',    '101', 1,    1, NULL, false),
  (2, 'Bob Brown',      '102', 1,    1, NULL, false),
  (3, 'Cara Cole',      '103', 1,    1, NULL, false),
  (4, 'Dan Diaz',       '104', 2,    1, NULL, false),
  (5, 'Eve Evans',      '105', 2,    1, NULL, false),
  (6, 'Finn Fox',       '106', NULL, 1, NULL, false),
  (7, 'Gus Gray',       '107', 1,    1, NULL, true);

INSERT INTO "WorkoutLocation" (id, name, "competitionId") VALUES
  (1, 'Main Floor', 1),
  (2, 'Back Rig',   1);

INSERT INTO "Workout" (id, number, name, "scoreType", lanes, "heatIntervalSecs",
                       "timeBetweenHeatsSecs", "callTimeSecs", "walkoutTimeSecs",
                       "startTime", status, "mixedHeats", "tiebreakEnabled",
                       "partBEnabled", "partBScoreType", "heatStartOverrides",
                       "competitionId", "halfWeight", "locationId",
                       "tiebreakScoreType", description) VALUES
  (1, 1, 'Fran',   'time',            3, 600, 120, 180, 60,
   '2026-03-01 09:00:00+00', 'completed', false, false, false, 'time', '{}', 1, false, 1, 'time',
   '21-15-9 thruster and pull-up'),
  (2, 2, 'Grace',  'reps',            3, 480,  90, 150, 45,
   '2026-03-01 11:00:00+00', 'completed', false, true,  false, 'time', '{}', 1, true,  1, 'time',
   'AMRAP 12'),
  (3, 3, 'Helen',  'time',            3, 540, 100, 160, 50,
   '2026-03-01 13:00:00+00', 'active',    false, false, true,  'reps', '{"2": "2026-03-01T13:30:00.000Z"}', 1, false, 2, 'time',
   'Part A for time, Part B max reps'),
  (4, 4, 'Isabel', 'lower_is_better', 3, 420,  80, 140, 40,
   '2026-03-01 15:00:00+00', 'completed', false, false, false, 'time', '{}', 1, false, 2, 'time',
   NULL),
  (5, 5, 'Jackie', 'reps',            3, 400,  70, 130, 35,
   NULL,                     'pending',   true,  false, false, 'time', '{}', 1, false, NULL, 'time',
   'Not drawn yet');

-- Lanes are given out middle-out in v1's seeding, so the fixture uses that
-- shape rather than 1-2-3 — a port that reverts to left-to-right shows up
-- in the schedule diff.
INSERT INTO "HeatAssignment" (id, "workoutId", "athleteId", "heatNumber", lane) VALUES
  (1,  1, 1, 1, 2), (2,  1, 2, 1, 1), (3,  1, 3, 1, 3),
  (4,  1, 4, 2, 2), (5,  1, 5, 2, 1), (6,  1, 6, 2, 3),
  (7,  1, 7, 3, 2),
  (8,  2, 3, 1, 2), (9,  2, 1, 1, 1), (10, 2, 2, 1, 3),
  (11, 2, 5, 2, 2), (12, 2, 4, 2, 1), (13, 2, 6, 2, 3),
  (14, 2, 7, 3, 2),
  (15, 3, 1, 1, 2), (16, 3, 2, 1, 1), (17, 3, 3, 1, 3),
  (18, 3, 4, 2, 2), (19, 3, 5, 2, 1),
  (20, 4, 2, 1, 2), (21, 4, 1, 1, 1), (22, 4, 3, 1, 3),
  (23, 4, 4, 2, 2), (24, 4, 5, 2, 1), (25, 4, 6, 2, 3);

-- Workout 1 heat 3 is deliberately left uncompleted: judge-schedule drops
-- completed heats, so a fixture that finishes everything would report an
-- empty schedule and prove nothing.
INSERT INTO "HeatCompletion" (id, "workoutId", "heatNumber", "completedAt") VALUES
  (1, 1, 1, '2026-03-01 09:12:00+00'),
  (2, 1, 2, '2026-03-01 09:24:00+00'),
  (4, 2, 1, '2026-03-01 11:10:00+00'),
  (5, 2, 2, '2026-03-01 11:20:00+00'),
  (6, 2, 3, '2026-03-01 11:30:00+00'),
  (7, 3, 1, '2026-03-01 13:15:00+00'),
  (8, 4, 1, '2026-03-01 15:08:00+00'),
  (9, 4, 2, '2026-03-01 15:16:00+00');

-- Finn did not start workouts 1-3, so those cells read DNS. Gus has no
-- scores at all.
INSERT INTO "Score" (id, "athleteId", "workoutId", "rawScore", "tiebreakRawScore",
                     points, "partBRawScore", "partBPoints") VALUES
  (1,  1, 1, 100, NULL, 1, NULL, NULL),
  (2,  2, 1, 110, NULL, 2, NULL, NULL),
  (3,  3, 1, 120, NULL, 3, NULL, NULL),
  (4,  4, 1, 130, NULL, 4, NULL, NULL),
  (5,  5, 1, 140, NULL, 5, NULL, NULL),

  (6,  1, 2, 60, 100, 2, NULL, NULL),
  (7,  2, 2, 65,  95, 1, NULL, NULL),
  (8,  3, 2, 55, 110, 3, NULL, NULL),
  (9,  4, 2, 50, 120, 4, NULL, NULL),
  (10, 5, 2, 45, 130, 5, NULL, NULL),

  (11, 1, 3, 200, NULL, 1, 30, 2),
  (12, 2, 3, 210, NULL, 2, 35, 1),
  (13, 3, 3, 220, NULL, 3, 25, 3),

  (14, 1, 4, 200, NULL, 2, NULL, NULL),
  (15, 2, 4, 100, NULL, 1, NULL, NULL),
  (16, 3, 4, 300, NULL, 3, NULL, NULL),
  (17, 4, 4, 400, NULL, 4, NULL, NULL),
  (18, 5, 4, 500, NULL, 5, NULL, NULL),
  (19, 6, 4, 600, NULL, 6, NULL, NULL);

INSERT INTO "VolunteerRole" (id, name, "competitionId") VALUES
  (1, 'Judge',      1),
  (2, 'Scorekeeper', 1);

-- Three judges for three lanes, plus one volunteer who is not a judge and
-- must never be assigned.
INSERT INTO "Volunteer" (id, name, "competitionId", "roleId") VALUES
  (1, 'Jo Judge',    1, 1),
  (2, 'Kim Keeper',  1, 1),
  (3, 'Lee Lane',    1, 1),
  (4, 'Mo Marker',   1, 2);

INSERT INTO "JudgeAssignment" (id, "workoutId", "volunteerId", "heatNumber", lane) VALUES
  (1, 1, 1, 1, 1), (2, 1, 2, 1, 2), (3, 1, 3, 1, 3),
  (4, 1, 2, 2, 1), (5, 1, 3, 2, 2), (6, 1, 1, 2, 3),
  (7, 1, 3, 3, 2),
  -- Workout 3 is still running, so these are the assignments a judge
  -- actually sees on the board.
  (8, 3, 1, 1, 1), (9, 3, 2, 1, 2), (10, 3, 3, 1, 3),
  (11, 3, 2, 2, 1), (12, 3, 3, 2, 2),
  -- Lane 3 of workout 3 heat 2 has no athlete in it; judge-schedule must
  -- drop this row rather than show a judge standing at an empty lane.
  (13, 3, 1, 2, 3);

-- A null divisionId means the item applies to every athlete in the heat, so
-- the Barbell count must widen past the Rx-only Rower.
INSERT INTO "WorkoutEquipment" (id, "workoutId", "divisionId", item) VALUES
  (1, 1, NULL, 'Barbell'),
  (2, 1, 1,    'Rower'),
  (3, 2, NULL, 'Barbell'),
  (4, 2, 2,    'Kettlebell :: 24kg'),
  (5, 3, 1,    'Rower');

-- leaderboardVisibility is deliberately absent: the two routes that read it
-- fall back to different defaults, and the golden output records that.
INSERT INTO "Setting" ("competitionId", key, value) VALUES
  (1, 'showBib',             'true'),
  (1, 'tiebreakWorkoutId',   '4'),
  (1, 'judgeMaxConsecutive', '2'),
  (1, 'judgePassword',       'golden-pass');

-- ─── The parity caller ──────────────────────────────────────────────────
-- Two of the six read endpoints are gated by requireCompetitionAccess, so
-- the differential needs a caller the guard accepts. The id is fixed rather
-- than generated: the same uuid exists in the hosted comphq-test auth as
-- user parity-golden@comphq.test, which is where v3 validates the bearer
-- token, and a generated id would make the fixture depend on which run
-- created it.
--
-- The membership is role='user', not 'admin'. requireCompetitionAccess
-- accepts either, and the weaker of the two proves the guard is passing on
-- membership rather than on privilege. isSuper stays false for the same
-- reason: a super-admin short-circuits the membership lookup entirely.

DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-000000000101';

INSERT INTO auth.users (id, email)
  VALUES ('00000000-0000-4000-8000-000000000101', 'parity-golden@comphq.test');

INSERT INTO "UserProfile" (id, "isSuper", "createdAt")
  VALUES ('00000000-0000-4000-8000-000000000101', false, '2026-01-01T00:00:00Z')
  ON CONFLICT (id) DO UPDATE SET "isSuper" = false;

INSERT INTO "CompetitionAdmin" ("userId", "competitionId", role, "createdAt")
  VALUES ('00000000-0000-4000-8000-000000000101', 1, 'user', '2026-01-01T00:00:00Z');

-- Leave the sequences past the fixture so anything inserted afterwards does
-- not collide with a hand-picked id.
SELECT setval('"Competition_id_seq"',   1000, true);
SELECT setval('"Division_id_seq"',      1000, true);
SELECT setval('"Athlete_id_seq"',       1000, true);
SELECT setval('"Workout_id_seq"',       1000, true);
SELECT setval('"WorkoutLocation_id_seq"', 1000, true);
SELECT setval('"HeatAssignment_id_seq"', 1000, true);
SELECT setval('"HeatCompletion_id_seq"', 1000, true);
SELECT setval('"Score_id_seq"',         1000, true);
SELECT setval('"Volunteer_id_seq"',     1000, true);
SELECT setval('"VolunteerRole_id_seq"', 1000, true);
SELECT setval('"JudgeAssignment_id_seq"', 1000, true);
SELECT setval('"WorkoutEquipment_id_seq"', 1000, true);
