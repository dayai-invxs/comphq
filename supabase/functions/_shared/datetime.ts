/**
 * Convert an <input type="datetime-local"> value ("YYYY-MM-DDTHH:MM") into
 * a full RFC3339 ISO timestamp ("YYYY-MM-DDTHH:MM:SS.sssZ") — what the API
 * zod schemas expect. datetime-local is in the browser's local time, so we
 * let `new Date()` interpret it that way and normalize to UTC.
 *
 * Returns null for empty strings so callers can pass the result straight
 * through as `startTime: toIsoOrNull(value)`.
 */
export function toIsoOrNull(localDateTime: string): string | null {
  const v = localDateTime.trim()
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Minutes the zone is ahead of UTC at the given instant. */
function zoneOffsetMin(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const wallMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((wallMs - utcMs) / 60000)
}

/**
 * The instant a wall-clock time ("YYYY-MM-DD", "HH:MM") names in an IANA zone,
 * as an ISO string. Null for a malformed date, time or zone.
 *
 * Guess with the offset at the naive UTC instant, then correct once with the
 * offset at the guess — enough to land on the right side of a DST change.
 */
export function zonedTimeToIso(date: string, time: string, timeZone: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!d || !t) return null
  const naive = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2])
  try {
    const guess = naive - zoneOffsetMin(naive, timeZone) * 60000
    return new Date(naive - zoneOffsetMin(guess, timeZone) * 60000).toISOString()
  } catch {
    return null
  }
}
