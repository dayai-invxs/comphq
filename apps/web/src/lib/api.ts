import { HttpError, delJson, getJson, patchJson, postJson, putJson } from './http'
import { getSupabaseClient, getSupabaseEnv } from './supabase'

// Everything the UI fetches goes through here.
//
// v1 was same-origin: a component called `getJson('/api/leaderboard?slug=x')`
// and Next served it, with the session arriving on a cookie its middleware had
// refreshed. v3's handlers are the same files, but they run as Supabase Edge
// Functions on a different origin and behind a gateway that wants credentials
// in headers. So this module does two things and nothing else — put the origin
// in front of v1's own path, and attach the two headers.
//
// The paths stay written as v1 wrote them, `/api/<resource>/...`, so a ported
// call site reads the same as the one it came from. One function per top-level
// resource means the prefix swap is the whole mapping.

const API_PREFIX = '/api/'

export function apiUrl(path: string): string {
  if (!path.startsWith(API_PREFIX)) {
    throw new Error(`apiUrl expects one of v1's ${API_PREFIX}... paths, got "${path}"`)
  }
  return `${getSupabaseEnv().functionsUrl}/functions/v1/${path.slice(API_PREFIX.length)}`
}

// `apikey` and `Authorization` are different credentials: the gateway reads
// the first, requireSession reads the second. Signed out, both are the anon
// key — the four public read endpoints need a caller, just not a member.
//
// Read per call rather than cached, because supabase-js rotates the access
// token on its own schedule and a cached one goes stale mid-session.
// x-region, when configured, pins where the function runs. The database is in
// one region; without the pin the gateway runs the function nearest the
// caller, and a caller on another continent pays that distance on every query.
async function authHeaders(): Promise<Record<string, string>> {
  const { anonKey, functionsRegion } = getSupabaseEnv()
  const { data } = await getSupabaseClient().auth.getSession()
  return {
    apikey: anonKey,
    authorization: `Bearer ${data.session?.access_token ?? anonKey}`,
    ...(functionsRegion ? { 'x-region': functionsRegion } : {}),
  }
}

async function read(init?: RequestInit): Promise<RequestInit> {
  return { ...init, headers: { ...(await authHeaders()), ...(init?.headers as Record<string, string>) } }
}

// http.ts sets its own content-type and then spreads `init` over it, so an
// init carrying headers replaces it rather than adding to it. http.ts is a
// byte-checked copy of v1 and is not edited for this; instead a write sends
// the complete set, which comes out identical whichever way that spread lands.
async function write(init?: RequestInit): Promise<RequestInit> {
  const headers = { 'content-type': 'application/json', ...(await authHeaders()) }
  return { ...init, headers: { ...headers, ...(init?.headers as Record<string, string>) } }
}

export async function apiGet<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  return getJson<T>(apiUrl(path), await read(init))
}

export async function apiPost<T = unknown>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return postJson<T>(apiUrl(path), body, await write(init))
}

export async function apiPut<T = unknown>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return putJson<T>(apiUrl(path), body, await write(init))
}

export async function apiPatch<T = unknown>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return patchJson<T>(apiUrl(path), body, await write(init))
}

// A bodyless DELETE must not claim a JSON body: several v1 routes read one and
// treat an unparseable body as an absent one, which for judge-assignments
// means "delete everything" (defect 11, ported as-is).
export async function apiDel<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const prepared = body === undefined ? await read(init) : await write(init)
  return delJson<T>(apiUrl(path), body, prepared)
}

// A multipart upload. It cannot go through http.ts: those helpers serialise
// the body as JSON and set a content-type, and a FormData body needs neither
// — the browser writes the multipart boundary into the header itself, and a
// content-type set here would arrive without one.
export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
  const res = await fetch(apiUrl(path), { ...(await read()), method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new HttpError(res.status, body || `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

// v1's exports were `<a href download>` pointing at /api/export. Same-origin,
// the session rode on a cookie and the browser did the rest. Cross-origin with
// a bearer token an anchor carries neither credential, so the file comes back
// through the same seam as everything else and is handed over as a blob.
//
// The filename is the server's: both export routes already build
// `<slug>-export-<date>` and say so in Content-Disposition, which the router
// exposes for exactly this reader. Naming it here would be that convention
// written twice.
function downloadName(disposition: string | null, url: string): string {
  const quoted = disposition?.match(/filename\s*=\s*"([^"]+)"/)?.[1]
  if (quoted) return quoted
  const bare = disposition?.match(/filename\s*=\s*([^;]+)/)?.[1]?.trim()
  return bare || new URL(url).pathname.split('/').pop() || 'download'
}

export async function apiDownload(path: string): Promise<void> {
  const url = apiUrl(path)
  const res = await fetch(url, await read())
  // http.ts owns this shape but does not export the helper, and it is a
  // byte-checked copy of v1 — three lines here beat an edit there.
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new HttpError(res.status, body || `HTTP ${res.status}`)
  }

  const href = URL.createObjectURL(await res.blob())
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = downloadName(res.headers.get('content-disposition'), url)
  anchor.click()
  URL.revokeObjectURL(href)
}
