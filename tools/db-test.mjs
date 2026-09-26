#!/usr/bin/env node
// pnpm test:sql — replay every migration into a throwaway database, then
// run the SQL suite against it.
//
// v1 tested RLS by pointing vitest at a hosted Supabase project, so the
// suite only ran when someone had credentials. Here the schema is rebuilt
// from the migrations on each run against a local Postgres, with
// supabase/tests/_shim.sql standing in for the platform objects. That
// makes a full migration replay part of the normal test loop rather than
// something only a deploy discovers.
//
// Target it with PGBIN / PGHOST / PGPORT / PGUSER, or set TEST_DATABASE to
// use a different database name.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { bin, fail, psql, replayInto, run, testsDir } from './pg.mjs'

const DB = process.env.TEST_DATABASE ?? 'comphq_v3_test'

const dropped = run(bin('dropdb'), ['--if-exists', DB])
if (!dropped.ok) fail(`dropdb ${DB}`, dropped.out)
const created = run(bin('createdb'), [DB])
if (!created.ok) fail(`createdb ${DB} — is Postgres running?`, created.out)

const migrations = replayInto(DB, { readdirSync })
process.stdout.write(`migrations replayed: ${migrations.length}\n`)

const assert = psql(DB, ['-f', join(testsDir, '_assert.sql')])
if (!assert.ok) fail('_assert.sql', assert.out)

// Each file runs inside a transaction that is always rolled back, so
// fixtures need no teardown and files cannot leak into one another.
const specs = readdirSync(testsDir).filter(f => f.endsWith('.test.sql')).sort()
let passed = 0

for (const file of specs) {
  const r = psql(DB, ['-f', '-'], `BEGIN;\n\\i ${join(testsDir, file)}\nROLLBACK;\n`)
  if (!r.ok) {
    const failed = r.out.split('\n').find(l => l.includes('not ok - '))
    fail(file, failed ?? r.out)
  }
  // psql prefixes notices with "psql:<file>:<line>: ", so anchor on the level.
  // The two spaces after NOTICE: are psql's own alignment padding.
  const count = (r.out.match(/NOTICE: {2}ok - /g) ?? []).length
  passed += count
  process.stdout.write(`  ${file} — ${count} passed\n`)
}

process.stdout.write(`\nSQL suite: ${specs.length} file(s), ${passed} assertion(s) passed\n`)
