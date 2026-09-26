// Shared Postgres plumbing for the db-* tools.
//
// Three scripts need the same four things — find the client binaries, read
// .env.local, pull the project ref out of a connection string, and run a
// command capturing both streams. Keeping one copy means a fix to any of
// them lands everywhere.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const migrationsDir = join(root, 'supabase/migrations')
export const testsDir = join(root, 'supabase/tests')

// The client must be at least as new as the server it talks to, so PGBIN
// exists to point at a specific installation. Without it, whatever is on
// PATH is used.
export function bin(name) {
  const dir = process.env.PGBIN
  return dir ? join(dir, name) : name
}

// psql writes query results to stdout but RAISE NOTICE to stderr, and the
// SQL assertions announce themselves as notices — so both streams matter
// on success as well as on failure.
export function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8' })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

export function psql(target, args, input) {
  const conn = target.startsWith('postgres') ? [target] : ['-d', target]
  return run(bin('psql'), [...conn, '-v', 'ON_ERROR_STOP=1', '-q', '--no-psqlrc', ...args], input)
}

export function loadEnv() {
  const file = join(root, '.env.local')
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

export function dbUrl() {
  const url = process.env.SUPABASE_DB_URL ?? loadEnv().SUPABASE_DB_URL
  if (!url) {
    console.error('SUPABASE_DB_URL is not set. Put it in comphq-v3/.env.local.')
    process.exit(1)
  }
  return url
}

// Every hosted connection string carries the project ref, either as the
// db.<ref>.supabase.co host or as the postgres.<ref> pooler username.
export function refFrom(url) {
  const ref =
    url.match(/db\.([a-z0-9]{20})\.supabase\.co/)?.[1] ??
    url.match(/postgres\.([a-z0-9]{20})/)?.[1]
  if (!ref) {
    console.error('Could not read a project ref from SUPABASE_DB_URL. Refusing to run.')
    process.exit(1)
  }
  return ref
}

export function fail(label, out) {
  process.stderr.write(`\n✖ ${label}\n${String(out).trim()}\n`)
  process.exit(1)
}

// Build a database from _shim.sql plus every migration, in filename order.
export function replayInto(db, { readdirSync }) {
  const shim = psql(db, ['-f', join(testsDir, '_shim.sql')])
  if (!shim.ok) fail('_shim.sql', shim.out)

  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  for (const file of files) {
    const r = psql(db, ['-f', join(migrationsDir, file)])
    if (!r.ok) fail(`migration ${file}`, r.out)
  }
  return files
}
