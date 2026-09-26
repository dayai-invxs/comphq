import { withRequestContext } from './request-context.ts'

// What Next did for the route handlers, minus Next.
//
// None of v1's 48 handlers import next/server — they take a web Request and
// return a web Response. The only framework-specific thing about them is the
// second argument, `{ params: Promise<...> }`, which is why this passes an
// already-resolved promise rather than a plain object: the handlers `await
// params`, and they are copied byte for byte, so the shape has to match.
//
// Two things here are genuinely new rather than ported. CORS, because v1 was
// same-origin and the SPA is not. And the 500 fallback, because an uncaught
// throw in a Deno handler takes the worker with it, where Next would have
// isolated it.

type Params = Record<string, string>
export type Handler<P extends Params = Params> =
  (req: Request, ctx: { params: Promise<P> }) => Response | Promise<Response>

// The path decides which params exist, and each copied handler declares the
// ones its own path provides — { id }, { id, heatNum }, { userId }. The router
// only ever holds Record<string, string>, and under strictFunctionTypes that
// is not assignable to the narrower shapes. The table therefore erases the
// params type. Erasing it here is the safe direction: widening the handlers
// would mean editing files that are checked byte-for-byte against v1.
// deno-lint-ignore no-explicit-any
export type Route = { method: string; pattern: string; handler: Handler<any> }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  // The export routes name the file they serve. Without this the browser hides
  // that header cross-origin and the client has to invent the name.
  'Access-Control-Expose-Headers': 'Content-Disposition',
}

// The gateway may hand over /functions/v1/<name>/… or /<name>/… depending on
// how it was reached. Both mean the same route.
function pathOf(req: Request, base: string): string {
  const { pathname } = new URL(req.url)
  const prefix = `/functions/v1/${base}`
  return pathname.startsWith(prefix) ? `/${base}${pathname.slice(prefix.length)}` : pathname
}

function match(pattern: string, path: string): Params | null {
  const p = pattern.split('/')
  const s = path.split('/')
  if (p.length !== s.length) return null
  const params: Params = {}
  for (let i = 0; i < p.length; i++) {
    const seg = p[i]
    if (seg.startsWith(':')) {
      if (!s[i]) return null
      params[seg.slice(1)] = decodeURIComponent(s[i])
    } else if (seg !== s[i]) {
      return null
    }
  }
  return params
}

// A literal segment wins over a param at the same position: /competitions/mine
// is a route of its own, not a competition whose id is "mine".
const literalFirst = (a: Route, b: Route) =>
  a.pattern.split('/').filter((s) => s.startsWith(':')).length -
  b.pattern.split('/').filter((s) => s.startsWith(':')).length

function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export function createRouter(base: string, routes: Route[]) {
  const ordered = [...routes].sort(literalFirst)

  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    const path = pathOf(req, base)
    const allow = new Set<string>()
    let hit: { route: Route; params: Params } | null = null

    for (const route of ordered) {
      const params = match(route.pattern, path)
      if (!params) continue
      allow.add(route.method)
      if (!hit && route.method === req.method) hit = { route, params }
    }

    if (!hit) {
      if (allow.size > 0) {
        return withCors(Response.json({ error: 'Method Not Allowed' }, {
          status: 405,
          headers: { Allow: [...allow].join(', ') },
        }))
      }
      return withCors(Response.json({ error: 'Not Found' }, { status: 404 }))
    }

    try {
      const res = await withRequestContext(req, () =>
        Promise.resolve(hit.route.handler(req, { params: Promise.resolve(hit.params) })))
      return withCors(res)
    } catch (e) {
      console.error(`${req.method} ${path}`, e)
      // The message rides along as `detail`: without it every distinct failure
      // reads as the same three words and can only be told apart in the logs.
      const detail = e instanceof Error ? e.message : String(e)
      return withCors(Response.json({ error: 'Internal Server Error', detail }, { status: 500 }))
    }
  }
}
