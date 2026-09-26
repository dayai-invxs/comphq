#!/usr/bin/env node
// pnpm db:seed — put the fixture into the hosted project so the app has
// something to draw.
//
// The data is tools/golden/seed.sql, the same fixture the golden-master
// differential runs against, because a second hand-written demo seed is a
// second answer to "what does a competition look like" and the two would
// drift. It exercises every screen: two divisions, seven athletes (one
// withdrawn, one with no division), five workouts across two locations,
// heats, scores with DNS gaps, equipment scoped both ways, and a volunteer
// who is not a judge.
//
// Three differences from what db:golden loads locally, all forced by the
// hosted project owning its own auth:
//
//   1. The fixture's three parity rows are dropped. They exist so the
//      differential has a caller with a known id; auth.users on a hosted
//      project belongs to GoTrue, and writing it directly makes an account
//      that cannot sign in.
//   2. --owner names a real account to administer the seeded competition,
//      created through the auth admin API if it is not there yet.
//   3. --today shifts every workout onto the current date. The fixture's
//      dates are fixed so the recorded output is byte-stable; a board with
//      every heat months in the past shows nothing worth looking at.
//
// Modes:
//   --confirm=<ref>             required; the project ref has to be typed
//   --today                     shift the fixture's dates onto today
//   --demo                      add a second, finished competition — a clone
//                               of the fixture left on its original (past)
//                               dates with every workout and heat completed,
//                               so the app shows a live event and a finished
//                               one side by side
//   --owner=<email>             give this account the competition(s)
//   --password=<pw>             only used when the account is created

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { dbUrl, fail, loadEnv, psql, refFrom, root } from './pg.mjs'

const DB_URL = dbUrl()
const ref = refFrom(DB_URL)
const args = process.argv.slice(2)
const has = (flag) => args.includes(flag)
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const sql = (statement) => psql(DB_URL, ['-v', 'ON_ERROR_STOP=1', '-c', statement])

if (value('confirm') !== ref) {
  console.error(
    `Seeding replaces every row in project ${ref}.\n` +
    `Re-run with --confirm=${ref} to proceed. This is deliberate: the ref has\n` +
    `to be typed, so the wrong project cannot be hit by reflex.`,
  )
  process.exit(1)
}

// ─── The fixture, minus the differential's own caller ─────────────────
const FIXTURE = join(root, 'tools/golden/seed.sql')
const text = readFileSync(FIXTURE, 'utf8')
const from = text.indexOf('INSERT INTO auth.users')
const to = text.indexOf('-- Leave the sequences')
if (from === -1 || to === -1 || to < from) {
  fail('parity block', `could not find the parity rows in ${FIXTURE}. Both anchors have to be there:\n` +
    `  INSERT INTO auth.users\n  -- Leave the sequences`)
}
const seed = text.slice(0, from) + text.slice(to)

const loaded = psql(DB_URL, ['-v', 'ON_ERROR_STOP=1', '-f', '-'], seed)
if (!loaded.ok) fail('seed.sql', loaded.out)
console.log(`seeded ${ref} from tools/golden/seed.sql`)

// ─── The finished competition ─────────────────────────────────────────
// A clone of the fixture rather than a second hand-written seed, for the
// reason in the header: one answer to "what does a competition look like".
// Ids are the fixture's plus 100 — the sequences sit at 1000, so nothing
// collides. What makes it finished: the pending workout is left out, every
// cloned workout is marked completed, every heat gets a completion row, and
// the dates stay on the fixture's 2026-03-01, which is the past. Judge
// assignments are not cloned — the judge schedule only shows heats still to
// run, and a finished event has none.
if (has('--demo')) {
  const demo = sql(`
    INSERT INTO "Competition" (id, name, slug)
      VALUES (101, 'Golden Master Spring', 'golden-spring');
    INSERT INTO "Division" (id, name, "order", "competitionId")
      SELECT id + 100, name, "order", 101 FROM "Division" WHERE "competitionId" = 1;
    INSERT INTO "Athlete" (id, name, "bibNumber", "divisionId", "competitionId", "userId", withdrawn)
      SELECT id + 100, name, "bibNumber", "divisionId" + 100, 101, "userId", withdrawn
        FROM "Athlete" WHERE "competitionId" = 1;
    INSERT INTO "WorkoutLocation" (id, name, "competitionId")
      SELECT id + 100, name, 101 FROM "WorkoutLocation" WHERE "competitionId" = 1;
    INSERT INTO "Workout" (id, number, name, "scoreType", lanes, "heatIntervalSecs",
                           "timeBetweenHeatsSecs", "callTimeSecs", "walkoutTimeSecs",
                           "startTime", status, "mixedHeats", "tiebreakEnabled",
                           "partBEnabled", "partBScoreType", "heatStartOverrides",
                           "competitionId", "halfWeight", "locationId",
                           "tiebreakScoreType", description)
      SELECT id + 100, number, name, "scoreType", lanes, "heatIntervalSecs",
             "timeBetweenHeatsSecs", "callTimeSecs", "walkoutTimeSecs",
             "startTime", 'completed', "mixedHeats", "tiebreakEnabled",
             "partBEnabled", "partBScoreType", "heatStartOverrides",
             101, "halfWeight", "locationId" + 100,
             "tiebreakScoreType", description
        FROM "Workout" WHERE "competitionId" = 1 AND status <> 'pending';
    INSERT INTO "HeatAssignment" (id, "workoutId", "athleteId", "heatNumber", lane)
      SELECT ha.id + 100, ha."workoutId" + 100, ha."athleteId" + 100, ha."heatNumber", ha.lane
        FROM "HeatAssignment" ha
        JOIN "Workout" w ON w.id = ha."workoutId" AND w."competitionId" = 1;
    INSERT INTO "HeatCompletion" ("workoutId", "heatNumber", "completedAt")
      SELECT DISTINCT ha."workoutId", ha."heatNumber", w."startTime" + INTERVAL '30 minutes'
        FROM "HeatAssignment" ha
        JOIN "Workout" w ON w.id = ha."workoutId" AND w."competitionId" = 101;
    INSERT INTO "Score" (id, "athleteId", "workoutId", "rawScore", "tiebreakRawScore",
                         points, "partBRawScore", "partBPoints")
      SELECT s.id + 100, s."athleteId" + 100, s."workoutId" + 100, s."rawScore",
             s."tiebreakRawScore", s.points, s."partBRawScore", s."partBPoints"
        FROM "Score" s
        JOIN "Workout" w ON w.id = s."workoutId" AND w."competitionId" = 1;
    INSERT INTO "VolunteerRole" (id, name, "competitionId")
      SELECT id + 100, name, 101 FROM "VolunteerRole" WHERE "competitionId" = 1;
    INSERT INTO "Volunteer" (id, name, "competitionId", "roleId")
      SELECT id + 100, name, 101, "roleId" + 100 FROM "Volunteer" WHERE "competitionId" = 1;
    INSERT INTO "WorkoutEquipment" (id, "workoutId", "divisionId", item)
      SELECT we.id + 100, we."workoutId" + 100, we."divisionId" + 100, we.item
        FROM "WorkoutEquipment" we
        JOIN "Workout" w ON w.id = we."workoutId" AND w."competitionId" = 1;
    INSERT INTO "Setting" ("competitionId", key, value)
      SELECT 101, key,
             CASE WHEN key = 'tiebreakWorkoutId' THEN ((value::int) + 100)::text ELSE value END
        FROM "Setting" WHERE "competitionId" = 1;`)
  if (!demo.ok) fail('--demo', demo.out)
  console.log('demo clone added: competition 101 (golden-spring), finished')
}

// ─── Dates ────────────────────────────────────────────────────────────
// One whole-day shift applied to both columns, so every interval the fixture
// sets between a call time, a walkout and a heat start survives it. Scoped to
// competition 1: the --demo clone is finished and stays in the past.
if (has('--today')) {
  const shifted = sql(`
    WITH d AS (SELECT (CURRENT_DATE - DATE '2026-03-01') AS days)
    UPDATE "Workout" w SET
      "startTime" = w."startTime" + ((SELECT days FROM d) * INTERVAL '1 day'),
      "heatStartOverrides" = COALESCE((
        SELECT jsonb_object_agg(
                 e.key,
                 to_char(((e.value #>> '{}')::timestamptz + ((SELECT days FROM d) * INTERVAL '1 day'))
                           AT TIME ZONE 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          FROM jsonb_each(w."heatStartOverrides") e), '{}'::jsonb)
    WHERE w."competitionId" = 1;`)
  if (!shifted.ok) fail('--today', shifted.out)
  console.log('dates shifted onto today')
}

// ─── Owner ────────────────────────────────────────────────────────────
const email = value('owner')
if (email) {
  const env = { ...loadEnv(), ...process.env }
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
    if (!env[key]) fail('owner', `${key} is not set. Put it in comphq-v3/.env.local.`)
  }
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) fail('owner', listErr.message)
  let user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())

  let password
  if (!user) {
    password = value('password') ?? randomBytes(9).toString('base64url')
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) fail('owner', created.error.message)
    user = created.data.user
  }

  // isSuper reaches every competition; the membership row is what the
  // per-competition gate reads, and the two are separate questions in v1.
  const granted = sql(`
    INSERT INTO "UserProfile" (id, "isSuper", "createdAt")
      VALUES ('${user.id}', true, now())
      ON CONFLICT (id) DO UPDATE SET "isSuper" = true;
    INSERT INTO "CompetitionAdmin" ("userId", "competitionId", role, "createdAt")
      SELECT '${user.id}', c.id, 'admin', now() FROM "Competition" c
      ON CONFLICT ("userId", "competitionId") DO UPDATE SET role = 'admin';`)
  if (!granted.ok) fail('owner', granted.out)

  console.log(`${email} administers every seeded competition${password ? ` (created; password: ${password})` : ''}`)
}

const counts = psql(DB_URL, ['-A', '-F', '\t', '-c', `
  SELECT 'Competition', count(*) FROM "Competition"
  UNION ALL SELECT 'Athlete', count(*) FROM "Athlete"
  UNION ALL SELECT 'Workout', count(*) FROM "Workout"
  UNION ALL SELECT 'HeatAssignment', count(*) FROM "HeatAssignment"
  UNION ALL SELECT 'Score', count(*) FROM "Score";`])
if (counts.ok) console.log(`\n${counts.out.trim()}`)
