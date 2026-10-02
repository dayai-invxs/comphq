import { z } from 'zod'
import { CcFetchError, fetchEvent, parseEventUrl, type FetchFn } from '@/lib/competitionCorner/client'
import type { Change } from '@/lib/competitionCorner/diff'
import { mapEvent, type ImportPlan } from '@/lib/competitionCorner/mapper'

/** What both the preview and the apply routes are asked: which event, read how. */

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const ImportRequest = z.object({
  slug: z.string().min(1),
  url: z.string().min(1),
  tz: z.string().refine(isTimeZone, 'Unknown time zone'),
  mergePartB: z.boolean(),
})
export type ImportRequest = z.infer<typeof ImportRequest>

type Loaded =
  | { ok: true; event: { id: number; name: string }; plan: ImportPlan }
  | { ok: false; response: Response }

export async function loadPlan(req: Omit<ImportRequest, 'slug'>, fetchFn: FetchFn = fetch): Promise<Loaded> {
  const eventId = parseEventUrl(req.url)
  if (eventId == null) {
    return { ok: false, response: new Response('Paste a Competition Corner event link, like competitioncorner.net/events/12345.', { status: 400 }) }
  }
  try {
    const ev = await fetchEvent(eventId, fetchFn)
    return { ok: true, event: { id: ev.id, name: ev.name }, plan: mapEvent(ev, { tz: req.tz, mergePartB: req.mergePartB }) }
  } catch (e) {
    if (e instanceof CcFetchError) return { ok: false, response: new Response(e.message, { status: 502 }) }
    throw e
  }
}

/** Fingerprint of a preview, so apply can tell when the source or the competition moved since. */
export async function changesVersion(changes: Change[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(changes))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}
