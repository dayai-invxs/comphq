import { logAudit } from './audit.ts'
import type { RequestContext } from './request-context.ts'

// The trail of who changed what, written by the router after every change a
// signed-in person makes: a score saved, a heat completed, an athlete
// withdrawn, a setting changed. One place rather than a call in each route, so
// a route added later is on the trail without anyone remembering to put it
// there.
//
// What is kept: who, when, the competition, the route and its ids, and the
// request body as sent, with anything that looks like a password blanked.
// Only successful changes: a refused or failed request changed nothing.

/** Writes that change nothing, or keep their own trail. */
const UNLOGGED = new Set([
  // A preview reads the file and answers what would change.
  'POST /import/competition-corner/preview',
  // Writes its own entry, with the import's summary.
  'POST /import/competition-corner/apply',
  // Corral and walk-out ticks: many a minute on game day, and undone by the
  // next tick.
  'PATCH /checks',
])

/** The longest body kept. A heat import can be a whole CSV. */
const MAX_BODY = 20_000

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) =>
      [k, /password/i.test(k) ? '[redacted]' : redact(v)]))
  }
  return value
}

/** The request body as the trail keeps it, read before the route consumes it. */
export async function auditBody(req: Request): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const type = req.headers.get('content-type') ?? ''
  if (type.startsWith('multipart/')) return '[file upload]'
  let text: string
  try { text = await req.clone().text() } catch { return undefined }
  if (!text) return undefined
  if (text.length > MAX_BODY) return `[${text.length} characters, not kept]`
  try { return redact(JSON.parse(text)) } catch { return '[not JSON]' }
}

export async function recordChange(
  req: Request,
  pattern: string,
  params: Record<string, string>,
  res: Response,
  ctx: RequestContext | undefined,
  body: unknown,
): Promise<void> {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return
  if (!res.ok || !ctx?.actor) return
  const action = `${req.method} ${pattern}`
  if (UNLOGGED.has(action)) return

  const ids = Object.values(params)
  await logAudit(
    { id: ctx.actor.userId, email: ctx.actor.email, isSuper: false },
    {
      action,
      resource: {
        type: pattern.split('/')[1] ?? '',
        id: ids.length ? ids.join('/') : null,
        competitionId: ctx.actor.competitionId,
      },
      diff: {
        ...(ids.length ? { params } : {}),
        ...(body === undefined ? {} : { body }),
      },
    },
  )
}
