#!/usr/bin/env node
// Apply the migrations to a hosted Supabase project over psql.
//
// The Supabase CLI is not installed here, and it is not needed: the
// migrations are plain SQL and the hosted project already provides the
// platform objects that supabase/tests/_shim.sql fakes locally. What this
// adds over a raw `psql -f` loop is the two things the CLI does that
// matter — recording applied versions in supabase_migrations.schema_migrations
// so a later `supabase db push` agrees about state, and refusing to touch a
// project the caller did not name.
//
// Modes:
//   --inventory                 read-only; what is in the database today
//   --wipe --confirm=<ref>      drop and recreate schema public
//   --push  --confirm=<ref>     apply every migration, then record versions
//
// SUPABASE_DB_URL must be the session pooler (port 5432), not the
// transaction pooler (6543): migrations run multi-statement DDL in
// transactions and 6543 cannot hold them.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { dbUrl, fail, migrationsDir, psql, refFrom } from './pg.mjs'

const DB_URL = dbUrl()
const ref = refFrom(DB_URL)
const args = process.argv.slice(2)
const has = flag => args.includes(flag)
const confirmed = args.find(a => a.startsWith('--confirm='))?.split('=')[1]
const sql = (a, i) => psql(DB_URL, a, i)

function requireConfirmation(action) {
  if (confirmed !== ref) {
    console.error(
      `${action} targets project ${ref}.\n` +
      `Re-run with --confirm=${ref} to proceed. This is deliberate: the ref\n` +
      `has to be typed, so the wrong project cannot be hit by reflex.`,
    )
    process.exit(1)
  }
}

// ─── Inventory (read-only) ────────────────────────────────────────────
if (has('--inventory') || args.length === 0) {
  console.log(`project: ${ref}\n`)
  const r = sql(['-A', '-F', '\t', '-c', `
    SELECT c.relname,
           COALESCE((SELECT n_live_tup FROM pg_stat_user_tables s
                      WHERE s.relid = c.oid), 0) AS approx_rows
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY c.relname;`])
  if (!r.ok) fail('inventory', r.out)
  console.log(r.out.trim() || '(no tables in schema public)')

  const users = sql(['-A', '-t', '-c', 'SELECT count(*) FROM auth.users;'])
  if (users.ok) console.log(`\nauth.users: ${users.out.trim()}`)
  if (!has('--wipe') && !has('--push')) {
    if (args.length === 0) console.log('\nNo action taken. Pass --wipe or --push.')
    process.exit(0)
  }
}

// ─── Wipe ─────────────────────────────────────────────────────────────
// Drops schema public and recreates it with the grants a fresh Supabase
// project ships with. auth.users is left alone: those are real login
// accounts, and nothing in the migrations depends on them being absent.
if (has('--wipe')) {
  requireConfirmation('--wipe')
  const r = sql(['-c', `
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    COMMENT ON SCHEMA public IS 'standard public schema';
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON SCHEMA public TO postgres;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    DROP TABLE IF EXISTS supabase_migrations.schema_migrations;`])
  if (!r.ok) fail('wipe', r.out)
  // The trigger on auth.users pointed at the dropped function; without
  // this, every new signup fails until the migrations recreate it.
  sql(['-c', 'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;'])
  console.log(`wiped schema public on ${ref}`)
}

// ─── Push ─────────────────────────────────────────────────────────────
if (has('--push')) {
  requireConfirmation('--push')
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

  const setup = sql(['-c', `
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version TEXT PRIMARY KEY,
      name    TEXT,
      statements TEXT[]
    );`])
  if (!setup.ok) fail('migration bookkeeping', setup.out)

  for (const file of files) {
    const version = file.slice(0, file.indexOf('_'))
    const applied = sql(['-A', '-t', '-c',
      `SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '${version}';`])
    if (applied.ok && applied.out.trim() === '1') {
      console.log(`  skip ${file} (already applied)`)
      continue
    }
    const r = sql(['-f', join(migrationsDir, file)])
    if (!r.ok) fail(file, r.out)
    const name = file.slice(file.indexOf('_') + 1, -4)
    sql(['-c', `INSERT INTO supabase_migrations.schema_migrations (version, name)
                VALUES ('${version}', '${name}') ON CONFLICT DO NOTHING;`])
    console.log(`  ${file}`)
  }
  console.log(`\npushed ${files.length} migration(s) to ${ref}`)
}
