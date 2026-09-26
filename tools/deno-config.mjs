#!/usr/bin/env node
// Generate supabase/functions/deno.json — the import map the Edge Functions
// resolve through.
//
// The ported handlers import '@/lib/...' and '@/db/schema' exactly as v1 wrote
// them, and they are checked byte-for-byte, so the aliases have to resolve at
// runtime rather than be rewritten. An import map does that, but only for bare
// specifiers and only with an explicit extension — Deno will not guess '.ts'.
//
// Generated rather than hand-kept: a shared module added without a matching
// entry would fail only at deploy time. `--check` fails the build instead.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sharedDir = join(root, 'supabase', 'functions', '_shared')
const out = join(root, 'supabase', 'functions', 'deno.json')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// The root manifest declares these under devDependencies: nothing at the root
// ships, they exist so vitest and tsc see the same libraries the functions
// import. deno.json is what pins them for the runtime.
const dep = (name) => {
  const range = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]
  if (!range) throw new Error(`${name} is not declared — deno.json would pin nothing`)
  return range
}

const imports = {}
for (const f of readdirSync(sharedDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort()) {
  imports[`@/lib/${f.slice(0, -3)}`] = `./_shared/${f}`
}
imports['@/db/schema'] = './_shared/db/schema.ts'

// Pinned to the same ranges the Node-side tests resolve, so the runtime that
// serves a request and the runtime that tests it agree about the library.
Object.assign(imports, {
  'drizzle-orm': `npm:drizzle-orm@${dep('drizzle-orm')}`,
  'drizzle-orm/': `npm:/drizzle-orm@${dep('drizzle-orm')}/`,
  '@supabase/supabase-js': `npm:@supabase/supabase-js@${dep('@supabase/supabase-js')}`,
  postgres: `npm:postgres@${dep('postgres')}`,
  zod: `npm:zod@${dep('zod')}`,
  fflate: `npm:fflate@${dep('fflate')}`,
})

const json = JSON.stringify({
  imports,
  compilerOptions: { lib: ['deno.window', 'deno.ns'], strict: true },
}, null, 2) + '\n'

if (process.argv.includes('--check')) {
  const current = readFileSync(out, 'utf8')
  if (current !== json) {
    console.error('supabase/functions/deno.json is stale — run pnpm gen:deno')
    process.exit(1)
  }
  console.log(`deno.json: ${Object.keys(imports).length} import entries, in sync`)
} else {
  writeFileSync(out, json)
  console.log(`wrote deno.json — ${Object.keys(imports).length} import entries`)
}
