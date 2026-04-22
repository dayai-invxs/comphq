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
