// Reads a Competition Corner event in the admin's browser. Competition Corner
// sits behind Cloudflare, which refuses requests from the Edge Functions'
// data-centre addresses (403) but serves browsers, and its public API answers
// any origin. So the browser reads the event and posts it to the import
// routes, which validate it fully (supabase/functions/_shared/competitionCorner/event.ts).
// Only the outer shape is checked here, enough to say which request failed.
//
// Competition Corner's server caches each answer by URL along with the headers
// of whichever request filled it. When that request had no Origin (its own
// site, a crawler), the cached answer has no CORS header and browsers refuse
// it until the cache turns over, minutes later. Each read adds a query no one
// else sends, so the answer is made fresh for this browser's request.

export const CC_API = 'https://competitioncorner.net/api2/v1'

export type FetchFn = (url: string) => Promise<Response>

/** The event as the import routes read it: the API's fields, plus `workouts` and `heats`. */
export type CcRawEvent = Record<string, unknown> & { name: string; divisions: unknown[]; workouts: unknown[]; heats: unknown[] }

const EVENT_URL = /^(?:https?:\/\/)?(?:www\.)?competitioncorner\.net\/events\/(\d+)(?:[/?#]|$)/i

/** Event id from a pasted event link or a bare id; null when it is neither. */
export function parseEventUrl(input: string): number | null {
  const s = input.trim()
  const m = /^\d+$/.test(s) ? [s, s] : EVENT_URL.exec(s)
  const id = m ? Number(m[1]) : 0
  return id > 0 ? id : null
}

const RETRY = 'Try again in a minute.'

let reads = 0
const fresh = () => `fresh=${Date.now().toString(36)}${(reads++).toString(36)}`

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function shapeError(what: string): Error {
  return new Error(`Competition Corner sent something other than ${what}. ${RETRY}`)
}

/**
 * One API read. `what` names it in errors, like "the event's heat sheets";
 * `notFound` is the message for a 404, when that means the link is wrong.
 */
async function read(fetchFn: FetchFn, path: string, what: string, notFound?: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetchFn(`${CC_API}/${path}?${fresh()}`)
  } catch {
    throw new Error("Couldn't reach Competition Corner from this browser. Check your connection and try again; if it keeps failing, Competition Corner may be blocking this browser, so try another one.")
  }
  if (res.status === 404 && notFound) throw new Error(notFound)
  if (!res.ok) throw new Error(`Competition Corner answered ${res.status} when reading ${what}. ${RETRY}`)
  try {
    return await res.json()
  } catch {
    throw shapeError(what)
  }
}

async function readEvent(fetchFn: FetchFn, id: number) {
  const what = "the event's details"
  const body = await read(fetchFn, `events/${id}`, what, `Competition Corner has no event ${id}. Check the link.`)
  if (!isRecord(body) || typeof body.name !== 'string' || !Array.isArray(body.divisions)) throw shapeError(what)
  return body as Record<string, unknown> & { name: string; divisions: unknown[] }
}

async function readWorkouts(fetchFn: FetchFn, id: number): Promise<unknown[]> {
  const what = "the event's workouts"
  const body = await read(fetchFn, `schedule/events/${id}/workouts`, what)
  if (!isRecord(body) || !Array.isArray(body.workouts)) throw shapeError(what)
  return Promise.all(body.workouts.map(async (w: unknown) => {
    if (!isRecord(w)) throw shapeError(what)
    const page = await read(fetchFn, `events/${id}/workouts/${w.id}/public`, `workout ${String(w.name)}`)
    if (!isRecord(page)) throw shapeError(`workout ${String(w.name)}`)
    return { ...w, timeCap: page.timeCap }
  }))
}

async function readHeats(fetchFn: FetchFn, id: number): Promise<unknown[]> {
  const what = "the event's heat sheets"
  const body = await read(fetchFn, `schedule/events/${id}/heats`, what)
  if (!Array.isArray(body)) throw shapeError(what)
  return body
}

/** Everything the import needs for one event. Independent requests run together. */
export async function fetchCcEvent(id: number, fetchFn: FetchFn = (url) => fetch(url)): Promise<CcRawEvent> {
  const eventP = readEvent(fetchFn, id)
  const workoutsP = readWorkouts(fetchFn, id)
  const heatsP = readHeats(fetchFn, id)
  // Let every read finish, then report the event's own error first: for a
  // wrong link every read fails, and "no event 8" says why where "404 reading
  // heat sheets" does not.
  await Promise.allSettled([eventP, workoutsP, heatsP])
  return { ...(await eventP), workouts: await workoutsP, heats: await heatsP }
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** What the source lists, and why parts of it cannot be imported yet. */
export function summarizeEvent(ev: { divisions: unknown[]; workouts: unknown[]; heats: unknown[] }): {
  text: string
  notice: string | null
} {
  const text = `Competition Corner lists ${count(ev.divisions.length, 'division')}, ${count(ev.workouts.length, 'workout')} and ${count(ev.heats.length, 'heat')}.`
  if (ev.workouts.length === 0) {
    return {
      text,
      notice:
        'This event has no workouts or heat sheets published yet, so only divisions can be imported. Run the import again once the schedule is out.',
    }
  }
  if (ev.heats.length === 0) {
    return {
      text,
      notice:
        'This event has no heat sheets published yet, so no athletes or lanes can be imported. Athletes come from the heat sheets; run the import again once they are out.',
    }
  }
  return { text, notice: null }
}
