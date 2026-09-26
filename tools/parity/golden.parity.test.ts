import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

/**
 * Golden-master differential — the v3 half.
 *
 * v1 records every read endpoint against the shared fixture into
 * tools/golden/expected/ (see tools/golden/README.md). This drives the same
 * fixture through v3's Edge Functions and diffs. Byte-equal is the
 * acceptance criterion.
 *
 * This is the check v2 never had. Its unit tests passed while its ranking
 * scale was inverted, because they tested v2's own logic. A differential
 * against v1 cannot be satisfied that way.
 *
 * Expected to run red until Phase 3 ports the handlers.
 */

const EXPECTED = resolve(import.meta.dirname, '../golden/expected')
const BASE = process.env.PARITY_BASE_URL ?? 'http://127.0.0.1:54321/functions/v1'
const SLUG = process.env.PARITY_SLUG ?? 'golden'
const KEY = process.env.PARITY_ANON_KEY
// Two of the six endpoints are gated by requireCompetitionAccess, which
// reads a real user JWT. That is a different credential from the anon key
// the platform wants in `apikey`, so the two headers are set separately.
const TOKEN = process.env.PARITY_ACCESS_TOKEN

// The recorded file name is the endpoint name: leaderboard.json is served by
// GET /leaderboard. Deriving it rather than listing it means a newly recorded
// endpoint is demanded of v3 automatically, instead of being forgotten.
const cases = readdirSync(EXPECTED)
  .filter((f) => f.endsWith('.json') || f.endsWith('.csv'))
  .sort()
  .map((file) => ({ file, endpoint: file.slice(0, -extname(file).length) }))

// Sorted keys, two-space indent — the same shape the v1 side recorded. Key
// order is not part of the contract; a different driver may return columns in
// a different order and that is not a port bug.
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).sort()
        .map((k) => [k, stable((value as Record<string, unknown>)[k])]),
    )
  }
  return value
}

// The one field that legitimately differs between the two runtimes. v1's CSV
// stamps `Exported,<Date.toLocaleString()>`, whose output depends on the ICU
// build — Node and Deno do not have to agree. It is masked rather than
// stripped, and its presence is asserted, so a port that drops the line fails.
const EXPORTED_LINE = /^Exported,.*$/m

function maskRuntimeFields(name: string, text: string): string {
  if (!name.endsWith('.csv')) return text
  expect(text, `${name} has no Exported line`).toMatch(EXPORTED_LINE)
  return text.replace(EXPORTED_LINE, 'Exported,<runtime>')
}

async function fetchEndpoint(endpoint: string): Promise<Response> {
  const headers: Record<string, string> = {}
  if (KEY) headers.apikey = KEY
  const bearer = TOKEN ?? KEY
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  return fetch(`${BASE}/${endpoint}?slug=${SLUG}`, { headers })
}

describe('golden master — v3 read endpoints match v1 byte for byte', () => {
  beforeAll(async () => {
    expect(cases.length, `no golden files in ${EXPECTED} — record them from v1 first`).toBeGreaterThan(0)
    try {
      await fetchEndpoint(cases[0].endpoint)
    } catch (cause) {
      throw new Error(
        `Nothing is serving ${BASE}.\n` +
        'The Edge Functions land in Phase 3; until then this suite is expected to be red.\n' +
        'Once they exist: supabase functions serve, seed tools/golden/seed.sql into the\n' +
        'database it points at, then re-run. See tools/golden/README.md.',
        { cause },
      )
    }
  })

  it.each(cases)('GET /$endpoint matches $file', async ({ file, endpoint }) => {
    const res = await fetchEndpoint(endpoint)
    expect(res.status, `GET /${endpoint} returned ${res.status}`).toBe(200)

    const type = res.headers.get('content-type') ?? ''
    const actual = type.includes('json')
      ? `${JSON.stringify(stable(await res.json()), null, 2)}\n`
      : await res.text()

    const expected = readFileSync(join(EXPECTED, file), 'utf8')
    expect(maskRuntimeFields(file, actual)).toBe(maskRuntimeFields(file, expected))
  })
})
