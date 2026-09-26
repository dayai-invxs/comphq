import { describe, it, expect, vi } from 'vitest'
import { createRouter } from './router'

const ok = (body: unknown) => Response.json(body)
const req = (method: string, path: string, init?: RequestInit) =>
  new Request(`http://edge.test${path}`, { method, ...init })

describe('createRouter', () => {
  it('dispatches on method and path', async () => {
    const router = createRouter('workouts', [
      { method: 'GET', pattern: '/workouts', handler: () => ok({ hit: 'list' }) },
      { method: 'POST', pattern: '/workouts', handler: () => ok({ hit: 'create' }) },
    ])
    expect(await (await router(req('GET', '/workouts'))).json()).toEqual({ hit: 'list' })
    expect(await (await router(req('POST', '/workouts'))).json()).toEqual({ hit: 'create' })
  })

  it('passes path params as the promise v1 handlers already await', async () => {
    const handler = vi.fn(async (_req: Request, ctx: { params: Promise<Record<string, string>> }) =>
      ok(await ctx.params))
    const router = createRouter('workouts', [
      { method: 'GET', pattern: '/workouts/:id/scores', handler },
    ])
    expect(await (await router(req('GET', '/workouts/12/scores'))).json()).toEqual({ id: '12' })
  })

  it('decodes percent-encoded params', async () => {
    const router = createRouter('volunteers', [
      { method: 'GET', pattern: '/volunteers/:id', handler: async (_r, c) => ok(await c.params) },
    ])
    expect(await (await router(req('GET', '/volunteers/a%2Fb'))).json()).toEqual({ id: 'a/b' })
  })

  it('keeps the query string off the match', async () => {
    const router = createRouter('leaderboard', [
      { method: 'GET', pattern: '/leaderboard', handler: (r) => ok({ slug: new URL(r.url).searchParams.get('slug') }) },
    ])
    expect(await (await router(req('GET', '/leaderboard?slug=golden'))).json()).toEqual({ slug: 'golden' })
  })

  it('tolerates the function name being repeated by the gateway', async () => {
    const router = createRouter('workouts', [
      { method: 'GET', pattern: '/workouts/:id', handler: async (_r, c) => ok(await c.params) },
    ])
    expect(await (await router(req('GET', '/functions/v1/workouts/7'))).json()).toEqual({ id: '7' })
  })

  it('prefers a literal segment over a param at the same position', async () => {
    const router = createRouter('competitions', [
      { method: 'GET', pattern: '/competitions/:id', handler: () => ok({ hit: 'byId' }) },
      { method: 'GET', pattern: '/competitions/mine', handler: () => ok({ hit: 'mine' }) },
    ])
    expect(await (await router(req('GET', '/competitions/mine'))).json()).toEqual({ hit: 'mine' })
    expect(await (await router(req('GET', '/competitions/4'))).json()).toEqual({ hit: 'byId' })
  })

  it('answers a known path with an unknown method 405 and an Allow header', async () => {
    const router = createRouter('checks', [
      { method: 'GET', pattern: '/checks', handler: () => ok({}) },
      { method: 'PATCH', pattern: '/checks', handler: () => ok({}) },
    ])
    const res = await router(req('DELETE', '/checks'))
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET, PATCH')
  })

  it('answers an unknown path 404', async () => {
    const router = createRouter('checks', [{ method: 'GET', pattern: '/checks', handler: () => ok({}) }])
    expect((await router(req('GET', '/nope'))).status).toBe(404)
  })

  it('answers a preflight without reaching a handler', async () => {
    const handler = vi.fn(() => ok({}))
    const router = createRouter('checks', [{ method: 'GET', pattern: '/checks', handler }])
    const res = await router(req('OPTIONS', '/checks', { headers: { Origin: 'http://app.test' } }))
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('authorization')
    // The SPA pins execution region with an x-region header; a preflight that
    // does not allow it would block every browser request that carries it.
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('x-region')
    expect(handler).not.toHaveBeenCalled()
  })

  it('adds the CORS origin header to a real response without discarding the handler headers', async () => {
    const router = createRouter('checks', [{
      method: 'GET',
      pattern: '/checks',
      handler: () => new Response('{}', { headers: { 'Cache-Control': 'no-store', 'content-type': 'application/json' } }),
    }])
    const res = await router(req('GET', '/checks'))
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('content-type')).toBe('application/json')
  })

  // The export routes name the file they are serving in Content-Disposition.
  // Cross-origin, a browser hides that header from the caller unless it is
  // exposed, and a client that cannot read it has to invent the name — which
  // is the whole export filename convention, re-derived.
  it('exposes the download filename header to a cross-origin caller', async () => {
    const router = createRouter('export', [{
      method: 'GET',
      pattern: '/export',
      handler: () => new Response('a,b', {
        headers: { 'Content-Disposition': 'attachment; filename="summer-export-2026-08-26.csv"' },
      }),
    }])
    const res = await router(req('GET', '/export'))
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('Content-Disposition')
  })

  // The detail is the thrown message: a 500 that says only "Internal Server
  // Error" sends whoever hit it into the function logs for something the
  // response already knew.
  it('turns a handler throw into a 500 that names the failure', async () => {
    const router = createRouter('checks', [{
      method: 'GET', pattern: '/checks', handler: () => { throw new Error('boom') },
    }])
    const res = await router(req('GET', '/checks'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal Server Error', detail: 'boom' })
  })

  it('names a non-Error throw too', async () => {
    const router = createRouter('checks', [{
      method: 'GET', pattern: '/checks', handler: () => { throw 'string throw' },
    }])
    const res = await router(req('GET', '/checks'))
    expect(await res.json()).toEqual({ error: 'Internal Server Error', detail: 'string throw' })
  })
})
