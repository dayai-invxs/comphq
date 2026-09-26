import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { anonKey, adminEmail, adminPassword, functionsUrl, serviceKey, supabaseUrl } from './env'

// How the suite talks to the API without a browser.
//
// v1's specs read the logged-in page's cookie jar and replayed it on every
// request, because the API was the same Next server the page came from. v3's
// handlers are the same files running as Edge Functions on their own origin,
// and they read a bearer token instead — so the suite signs in through
// supabase-js directly and never needs a browser context to mutate anything.
// That is why the fixtures below are seeded before a page is ever opened.

const API_PREFIX = '/api/'

/**
 * v1's own path, on the origin that answers it now. The same mapping
 * apps/web/src/lib/api.ts applies in the browser; it cannot be imported here
 * because that module reads its origin from `import.meta.env`, which only
 * exists under Vite. Specs are written with v1's paths so a call reads the
 * same on both sides of the port.
 */
export function apiUrl(path: string): string {
  if (!path.startsWith(API_PREFIX)) {
    throw new Error(`apiUrl expects one of v1's ${API_PREFIX}... paths, got "${path}"`)
  }
  return `${functionsUrl}/functions/v1/${path.slice(API_PREFIX.length)}`
}

export type ApiAs = (method: string, path: string, body?: unknown) => Promise<unknown>

/**
 * `apikey` and `Authorization` are different credentials, as they are in the
 * app: the gateway reads the first, requireSession reads the second.
 */
export function apiAs(token: string): ApiAs {
  return async (method, path, body) => {
    const res = await fetch(apiUrl(path), {
      method,
      headers: {
        apikey: anonKey(),
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    // Not swallowed: a fixture that failed to seed makes every assertion after
    // it lie about what it proved.
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
    return text ? JSON.parse(text) : null
  }
}

export async function signIn(email: string, password: string): Promise<string> {
  const anon = createClient(supabaseUrl(), anonKey(), { auth: { persistSession: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(`Could not sign in as ${email}: ${error?.message ?? 'no session returned'}`)
  }
  return data.session.access_token
}

// The suite runs on one worker, so one token serves the whole run. It outlives
// it: Supabase issues an hour and the suite is minutes.
let cachedAdminToken: Promise<string> | undefined
export function adminToken(): Promise<string> {
  cachedAdminToken ??= signIn(adminEmail(), adminPassword())
  return cachedAdminToken
}

let service: SupabaseClient | undefined
/** The service role, for the rows and the auth users a spec has to create behind the API. */
export function serviceClient(): SupabaseClient {
  service ??= createClient(supabaseUrl(), serviceKey(), { auth: { persistSession: false } })
  return service
}
