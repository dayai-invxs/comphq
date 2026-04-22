export type HeatStartOverrides = Record<string, string>

function parseOverrides(input: HeatStartOverrides | string | null | undefined): HeatStartOverrides {
  if (input == null) return {}
  if (typeof input === 'object') return input
  try { return JSON.parse(input || '{}') as HeatStartOverrides } catch { return {} }
}

/**
 * Calculate the start time for a given heat, respecting per-heat overrides.
 *
 * Accepts overrides as either a parsed object (new jsonb column) or a JSON
 * string (legacy text column) — both remain in flight during rollout.
 *
 * Logic: find the highest-numbered anchor at or before heatNumber, then
 * offset forward by (heatNumber - anchor) × interval. Editing heat N
 * leaves 1..N-1 alone and cascades N+1, N+2…
 */
export function calcHeatStartMs(
  heatNumber: number,
  workoutStartTime: string | Date | null,
  heatIntervalSecs: number,
  overrides: HeatStartOverrides | string | null | undefined,
  timeBetweenHeatsSecs = 0
): number | null {
  if (!workoutStartTime) return null

  const parsed = parseOverrides(overrides)

  // Implicit anchor: heat 1 = workoutStartTime
  let bestHeat = 1
  let bestMs = new Date(workoutStartTime).getTime()

  for (const [key, iso] of Object.entries(parsed)) {
    const n = Number(key)
    if (n <= heatNumber && n >= bestHeat) {
      bestHeat = n
      bestMs = new Date(iso).getTime()
    }
  }

  return bestMs + (heatNumber - bestHeat) * (heatIntervalSecs + timeBetweenHeatsSecs) * 1000
}

export function fmtHeatTime(ms: number | null): string {
  if (ms == null) return '—'
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
