import { z } from 'zod'
import { parseEvent } from '@/lib/competitionCorner/event'
import type { Change } from '@/lib/competitionCorner/diff'
import { mapEvent, type ImportPlan } from '@/lib/competitionCorner/mapper'

/**
 * What both the preview and the apply routes are asked: the event the admin's
 * browser read from Competition Corner (see event.ts for why it is posted),
 * and how to read it.
 */

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
  tz: z.string().refine(isTimeZone, 'Unknown time zone'),
  mergePartB: z.boolean(),
  /** Validated by parseEvent, so a mismatch gets its own message. */
  event: z.unknown(),
})
export type ImportRequest = z.infer<typeof ImportRequest>

type Loaded =
  | { ok: true; event: { id: number; name: string }; plan: ImportPlan }
  | { ok: false; response: Response }

export function loadPlan(req: Omit<ImportRequest, 'slug'>): Loaded {
  const parsed = parseEvent(req.event)
  if (!parsed.ok) {
    return {
      ok: false,
      response: new Response(
        `Competition Corner's data for this event is not in the shape the import reads (at ${parsed.where}). ` +
          'The import needs an update before this event can come in.',
        { status: 400 },
      ),
    }
  }
  const ev = parsed.event
  return { ok: true, event: { id: ev.id, name: ev.name }, plan: mapEvent(ev, { tz: req.tz, mergePartB: req.mergePartB }) }
}

/** Fingerprint of a preview, so apply can tell when the source or the competition moved since. */
export async function changesVersion(changes: Change[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(changes))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}
