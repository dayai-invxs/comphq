import { HttpError } from './http'

// One reading of "what went wrong" for anything a request can throw.
//
// http.ts puts the raw response body into HttpError's message, so what arrives
// here is usually a JSON object like {"error":"...","detail":"..."} — the
// router's shape — and showing that string verbatim hands the user a line of
// JSON. This digs the sentence out and falls back down the ladder: named
// error with detail, named error, raw body, status.
export function errorMessage(e: unknown): string {
  if (e instanceof HttpError) {
    const body: unknown = (() => { try { return JSON.parse(e.message) } catch { return null } })()
    if (body && typeof body === 'object') {
      const { error, detail } = body as { error?: unknown; detail?: unknown }
      if (typeof error === 'string' && error) {
        return typeof detail === 'string' && detail ? `${error}: ${detail}` : error
      }
    }
    return e.message || `HTTP ${e.status}`
  }
  return e instanceof Error ? e.message : String(e)
}
