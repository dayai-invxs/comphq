#!/usr/bin/env node
// pnpm db:golden — build the fixture database the golden-master differential
// runs against.
//
// Both halves of the differential read the same fixture: v1 records its
// responses from it, v3 is diffed against those recordings. Rebuilding it by
// hand is how the two sides drift apart, so it is one command: drop, replay
// every migration, load tools/golden/seed.sql.
//
// The seed is deterministic — no now(), no random() — because the recorded
// output is compared byte for byte.
//
// The server must be at least as new as the hosted project. Point PGBIN and
// PGPORT at that installation:
//
//   PGBIN=/opt/homebrew/opt/postgresql@17/bin PGPORT=5433 pnpm db:golden

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { bin, fail, psql, replayInto, root, run } from './pg.mjs'

const DB = process.env.GOLDEN_DATABASE ?? 'comphq_golden'

const dropped = run(bin('dropdb'), ['--if-exists', DB])
if (!dropped.ok) fail(`dropdb ${DB}`, dropped.out)
const created = run(bin('createdb'), [DB])
if (!created.ok) fail(`createdb ${DB} — is Postgres running?`, created.out)

const migrations = replayInto(DB, { readdirSync })
console.log(`${migrations.length} migrations replayed`)

const seed = psql(DB, ['-v', 'ON_ERROR_STOP=1', '-f', join(root, 'tools/golden/seed.sql')])
if (!seed.ok) fail('seed.sql', seed.out)

// Name the server, not just the database. The port comes from libpq's
// environment, so `pnpm db:golden` and whatever serves the functions can
// silently be looking at two different Postgres instances that both have a
// database by this name.
const where = psql(DB, ['-A', '-t', '-c',
  "SELECT current_database() || ' on port ' || current_setting('port');"])
console.log(`fixture seeded into ${where.ok ? where.out.trim() : DB}`)
console.log('record from v1: GOLDEN_UPDATE=1 GOLDEN_DB_URL=postgres://…/' + DB + ' TZ=UTC pnpm test:golden')
