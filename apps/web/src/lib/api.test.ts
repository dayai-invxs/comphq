import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock is hoisted above the file, so the spies have to be too.
const { getJson, postJson, putJson, patchJson, delJson, getSession, env, HttpError } = vi.hoisted(() => ({
  getJson: vi.fn(), postJson: vi.fn(), putJson: vi.fn(),
  patchJson: vi.fn(), delJson: vi.fn(), getSession: vi.fn(),
  env: { current: {} as { url: string; anonKey: string; functionsUrl: string; functionsRegion?: string } },
  HttpError: class HttpError extends Error {
    constructor(readonly status: number, message: string) { super(message) }
  },
}))
vi.mock('./http', () => ({ getJson, postJson, putJson, patchJson, delJson, HttpError }))
vi.mock('./supabase', () => ({
  getSupabaseClient: () => ({ auth: { getSession } }),
  getSupabaseEnv: () => env.current,
}))

import { apiDel, apiDownload, apiGet, apiPatch, apiPost, apiPut, apiUpload, apiUrl } from './api'

const signedIn = { data: { session: { access_token: 'user-jwt' } } }
const signedOut = { data: { session: null } }

const DEFAULT_ENV = {
  url: 'https://project.supabase.co',
  anonKey: 'anon-key',
  functionsUrl: 'https://project.supabase.co',
}

beforeEach(() => {
  vi.clearAllMocks()
  env.current = { ...DEFAULT_ENV }
  getSession.mockResolvedValue(signedOut)
})

describe('apiUrl', () => {
  // Auth stays on the project while the functions run on a local port.
  it('follows the functions origin, not the project origin', () => {
    env.current = { ...DEFAULT_ENV, functionsUrl: 'http://localhost:54321' }
    expect(apiUrl('/api/me')).toBe('http://localhost:54321/functions/v1/me')
  })

  it('swaps v1 route paths onto the Edge Function base', () => {
    expect(apiUrl('/api/leaderboard')).toBe('https://project.supabase.co/functions/v1/leaderboard')
  })

  it('keeps the query string, which is where the tenant slug rides', () => {
    expect(apiUrl('/api/schedule?slug=summer-throwdown')).toBe(
      'https://project.supabase.co/functions/v1/schedule?slug=summer-throwdown',
    )
  })

  it('keeps nested segments, which the per-resource routers match on', () => {
    expect(apiUrl('/api/workouts/12/equipment')).toBe(
      'https://project.supabase.co/functions/v1/workouts/12/equipment',
    )
  })

  // A call site that lost its prefix would otherwise hit the SPA's own origin
  // and 404 into index.html, which reads as an empty response rather than a bug.
  it('rejects a path that is not one of v1s /api routes', () => {
    expect(() => apiUrl('/leaderboard')).toThrow(/\/api\//)
  })
})

describe('auth headers', () => {
  it('sends the anon key as apikey and as the bearer when signed out', async () => {
    await apiGet('/api/leaderboard')
    const [, init] = getJson.mock.calls[0]
    expect(init.headers).toMatchObject({ apikey: 'anon-key', authorization: 'Bearer anon-key' })
  })

  it('sends the users access token as the bearer when signed in', async () => {
    getSession.mockResolvedValue(signedIn)
    await apiGet('/api/me')
    const [, init] = getJson.mock.calls[0]
    expect(init.headers).toMatchObject({ apikey: 'anon-key', authorization: 'Bearer user-jwt' })
  })

  it('reads the session per call, so a sign-in mid-session is picked up', async () => {
    await apiGet('/api/me')
    getSession.mockResolvedValue(signedIn)
    await apiGet('/api/me')
    expect(getJson.mock.calls[1][1].headers.authorization).toBe('Bearer user-jwt')
  })

  it('lets a caller override a header', async () => {
    await apiGet('/api/export', { headers: { accept: 'text/csv' } })
    expect(getJson.mock.calls[0][1].headers).toMatchObject({ accept: 'text/csv', apikey: 'anon-key' })
  })

  // The gateway reads x-region and runs the function there. The database is
  // in one region, so pinning execution beside it takes a cross-continent
  // round-trip out of every request.
  it('pins the execution region when the env names one', async () => {
    env.current = { ...DEFAULT_ENV, functionsRegion: 'us-west-2' }
    await apiPost('/api/athletes', { name: 'Cy' })
    expect(postJson.mock.calls[0][2].headers).toMatchObject({ 'x-region': 'us-west-2' })
  })

  it('sends no x-region when the env names none', async () => {
    await apiGet('/api/me')
    expect(getJson.mock.calls[0][1].headers).not.toHaveProperty('x-region')
  })
})

// http.ts spreads `init` after the content-type it sets, so an init carrying
// headers replaces it. http.ts is a byte-checked copy of v1 and is not edited
// for this; instead every write here sends the complete header set, which
// comes out the same whichever way that spread resolves.
describe('write verbs', () => {
  const cases = [
    ['post', apiPost, postJson],
    ['put', apiPut, putJson],
    ['patch', apiPatch, patchJson],
  ] as const

  for (const [name, fn, spy] of cases) {
    it(`${name} sends content-type alongside the auth headers`, async () => {
      await fn('/api/athletes', { name: 'Ada' })
      const [url, body, init] = spy.mock.calls[0]
      expect(url).toBe('https://project.supabase.co/functions/v1/athletes')
      expect(body).toEqual({ name: 'Ada' })
      expect(init.headers).toMatchObject({
        'content-type': 'application/json',
        apikey: 'anon-key',
        authorization: 'Bearer anon-key',
      })
    })
  }

  it('delete carries the body through, since v1 routes read one', async () => {
    await apiDel('/api/workouts/3/judge-assignments', { heatNumber: 2 })
    const [url, body, init] = delJson.mock.calls[0]
    expect(url).toBe('https://project.supabase.co/functions/v1/workouts/3/judge-assignments')
    expect(body).toEqual({ heatNumber: 2 })
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' })
  })

  // DELETE with no body must not claim one: http.ts only sets content-type
  // when a body is present, and a JSON content-type on an empty body is a lie
  // the Edge Function's parseJson would try to read.
  it('delete without a body sends no content-type', async () => {
    await apiDel('/api/workouts/3/judge-assignments')
    const [, body, init] = delJson.mock.calls[0]
    expect(body).toBeUndefined()
    expect(init.headers['content-type']).toBeUndefined()
  })
})

describe('return value', () => {
  it('resolves whatever http.ts parsed, without touching it', async () => {
    getJson.mockResolvedValue({ rows: [1, 2] })
    await expect(apiGet('/api/leaderboard')).resolves.toEqual({ rows: [1, 2] })
  })
})

// v1's exports were plain `<a href download>`: same-origin, and the session
// rode on a cookie. Cross-origin with a bearer token, an anchor sends neither,
// so the file is fetched and handed to the browser as a blob instead.
describe('apiDownload', () => {
  const CSV = 'attachment; filename="summer-export-2026-08-26.csv"'
  let fetchMock: ReturnType<typeof vi.fn>
  // The anchor is created inside the function and never returned, so the click
  // spy is what hands it back: `this` is the element the browser was given.
  let clicked: HTMLAnchorElement[]

  function respond(init: { headers?: Record<string, string>; ok?: boolean; status?: number; body?: string } = {}) {
    fetchMock.mockResolvedValue({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      headers: new Headers(init.headers ?? { 'content-disposition': CSV }),
      blob: () => Promise.resolve(new Blob([init.body ?? 'a,b'])),
      text: () => Promise.resolve(init.body ?? ''),
    })
  }

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    clicked = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
    URL.createObjectURL = vi.fn(() => 'blob:handed-over')
    URL.revokeObjectURL = vi.fn()
    respond()
  })

  it('asks the function origin, carrying the auth headers an anchor cannot', async () => {
    getSession.mockResolvedValue(signedIn)
    await apiDownload('/api/export?slug=summer')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://project.supabase.co/functions/v1/export?slug=summer')
    expect(init.headers).toMatchObject({ apikey: 'anon-key', authorization: 'Bearer user-jwt' })
  })

  // The server already builds `<slug>-export-<date>`; naming the file here
  // would be that convention written a second time.
  it('takes the filename the server sent', async () => {
    await apiDownload('/api/export?slug=summer')
    expect(clicked[0].download).toBe('summer-export-2026-08-26.csv')
    expect(clicked[0].href).toBe('blob:handed-over')
  })

  it('falls back to the last path segment when the header is missing', async () => {
    respond({ headers: {} })
    await apiDownload('/api/export/zip?slug=summer')
    expect(clicked[0].download).toBe('zip')
  })

  it('releases the object URL once the browser has it', async () => {
    await apiDownload('/api/export?slug=summer')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:handed-over')
  })

  // v1 gave a rejected export a page of text where the file should be. A
  // caller that can see the failure can say so instead.
  it('throws on a refusal rather than downloading the refusal', async () => {
    respond({ ok: false, status: 403, body: 'Forbidden' })
    await expect(apiDownload('/api/export?slug=summer')).rejects.toThrow('Forbidden')
    expect(clicked).toHaveLength(0)
  })
})

describe('apiUpload', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  function respond(init: { ok?: boolean; status?: number; body?: string; json?: unknown } = {}) {
    fetchMock.mockResolvedValue({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: () => Promise.resolve(init.json ?? { url: 'https://cdn/logo.png' }),
      text: () => Promise.resolve(init.body ?? ''),
    })
  }

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    respond()
  })

  function form() {
    const fd = new FormData()
    fd.append('logo', new File(['x'], 'logo.png', { type: 'image/png' }))
    return fd
  }

  it('posts the form to the function origin with the auth headers', async () => {
    getSession.mockResolvedValue(signedIn)
    const fd = form()
    await apiUpload('/api/logo', fd)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://project.supabase.co/functions/v1/logo')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(fd)
    expect(init.headers).toMatchObject({ apikey: 'anon-key', authorization: 'Bearer user-jwt' })
  })

  // The browser writes the multipart boundary into the content-type itself.
  // Setting the header here would send one without a boundary, and the server
  // would read no parts at all.
  it('leaves the content type to the browser, which owns the boundary', async () => {
    await apiUpload('/api/logo', form())
    const [, init] = fetchMock.mock.calls[0]
    expect(Object.keys(init.headers).map((k) => k.toLowerCase())).not.toContain('content-type')
  })

  it('hands back the parsed body', async () => {
    respond({ json: { url: 'https://cdn/competition-logo.png' } })
    await expect(apiUpload('/api/logo', form())).resolves.toEqual({ url: 'https://cdn/competition-logo.png' })
  })

  // v1 checked res.ok and did nothing with a refusal, so an oversized file or
  // a rejected type looked exactly like a successful upload.
  it('throws on a refusal rather than reporting nothing', async () => {
    respond({ ok: false, status: 413, body: 'File too large (max 2 MB)' })
    await expect(apiUpload('/api/logo', form())).rejects.toThrow('File too large (max 2 MB)')
  })
})
