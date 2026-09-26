#!/usr/bin/env node
// pnpm parity:token — mint an access token for the golden-master differential.
//
// Four of the six recorded endpoints are public. The other two go through
// requireCompetitionAccess, which validates a real user JWT against the
// hosted auth server, so the differential needs a caller that exists there.
//
// This ensures that caller exists and prints a fresh token on stdout. It
// prints nothing else, so the caller can capture it directly:
//
//   PARITY_ACCESS_TOKEN=$(pnpm -s parity:token) pnpm test:parity
//
// The id is fixed and matches the row tools/golden/seed.sql puts in the
// fixture. Both sides have to agree on it, and a generated id would make the
// fixture depend on which run created the account.
//
// No password is stored anywhere. The service key mints a one-time magic-link
// token and exchanges it for a session, so the repo carries no credential for
// this account and the token expires on its own.

import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './pg.mjs'

export const PARITY_USER_ID = '00000000-0000-4000-8000-000000000101'
export const PARITY_EMAIL = 'parity-golden@comphq.test'

const env = { ...loadEnv(), ...process.env }
for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'VITE_SUPABASE_ANON_KEY']) {
  if (!env[key]) {
    console.error(`${key} is not set. Put it in comphq-v3/.env.local.`)
    process.exit(1)
  }
}

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

const created = await admin.auth.admin.createUser({
  id: PARITY_USER_ID,
  email: PARITY_EMAIL,
  email_confirm: true,
})
if (created.error && !/already/i.test(created.error.message)) {
  console.error(`could not create ${PARITY_EMAIL}: ${created.error.message}`)
  process.exit(1)
}

const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: PARITY_EMAIL })
if (link.error) {
  console.error(`could not mint a token for ${PARITY_EMAIL}: ${link.error.message}`)
  process.exit(1)
}

const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})
const session = await anon.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: 'magiclink',
})
if (session.error) {
  console.error(`could not exchange the token: ${session.error.message}`)
  process.exit(1)
}
if (session.data.user?.id !== PARITY_USER_ID) {
  console.error(`token belongs to ${session.data.user?.id}, not ${PARITY_USER_ID}`)
  process.exit(1)
}

console.log(session.data.session.access_token)
