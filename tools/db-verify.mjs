#!/usr/bin/env node
// pnpm db:verify — prove the hosted schema still equals a clean replay of
// the migration set.
//
// A push that reports success only proves the statements ran. This rebuilds
// the schema locally from scratch, dumps both sides, and diffs them. Any
// difference is drift: something changed the hosted database outside the
// migrations, or a migration is not reproducible.
//
// The local replay must run on a server at least as new as the hosted one,
// since pg_dump refuses to read a newer server. Point PGBIN and PGPORT at
// that installation:
//
//   PGBIN=/opt/homebrew/opt/postgresql@17/bin PGPORT=5433 pnpm db:verify

import { readdirSync } from 'node:fs'
import { bin, dbUrl, fail, refFrom, replayInto, run } from './pg.mjs'

const DB_URL = dbUrl()
const ref = refFrom(DB_URL)
const LOCAL = process.env.VERIFY_DATABASE ?? 'comphq_v3_replay'

// Three classes of pg_dump output differ between two databases holding the
// identical schema. None of them carry meaning:
//   \restrict  — a random per-invocation session token
//   TO a, b    — role lists print in OID order, so creation order shows up
//   blank/SET  — preamble that varies with server settings
function normalize(text) {
  return text
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('--') && !l.startsWith('SET ') &&
                 !l.startsWith('SELECT pg_catalog') &&
                 !l.startsWith('\\restrict') && !l.startsWith('\\unrestrict'))
    .map(l => l.replace(/ TO ([a-z_]+(?:, [a-z_]+)+)/g,
      (_, roles) => ` TO ${roles.split(', ').sort().join(', ')}`))
    .map(l => l.trimEnd())
    .sort()
    .join('\n')
}

const dropped = run(bin('dropdb'), ['--if-exists', LOCAL])
if (!dropped.ok) fail(`dropdb ${LOCAL}`, dropped.out)
const created = run(bin('createdb'), [LOCAL])
if (!created.ok) fail(`createdb ${LOCAL} — is the local server running?`, created.out)

const migrations = replayInto(LOCAL, { readdirSync })

const dumpArgs = ['--schema-only', '--schema=public', '--no-owner', '--no-privileges']
const local = run(bin('pg_dump'), ['-d', LOCAL, ...dumpArgs])
if (!local.ok) fail('pg_dump (local replay)', local.out)
const hosted = run(bin('pg_dump'), [DB_URL, ...dumpArgs])
if (!hosted.ok) fail('pg_dump (hosted)', hosted.out)

const a = normalize(local.out).split('\n')
const b = normalize(hosted.out).split('\n')
const onlyLocal = a.filter(l => !b.includes(l))
const onlyHosted = b.filter(l => !a.includes(l))

if (onlyLocal.length === 0 && onlyHosted.length === 0) {
  console.log(`${migrations.length} migrations replayed`)
  console.log(`schema on ${ref} matches the migration set`)
  process.exit(0)
}

console.error(`\n✖ hosted schema on ${ref} has drifted from the migration set\n`)
for (const l of onlyLocal) console.error(`  migrations only: ${l}`)
for (const l of onlyHosted) console.error(`  hosted only:     ${l}`)
process.exit(1)
