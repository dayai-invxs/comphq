export type HeatStartOverrides = Record<string, string>

function parseOverrides(input: HeatStartOverrides | string | null | undefined): HeatStartOverrides {
  if (input == null) return {}
  if (typeof input === 'object') return input
  try { return JSON.parse(input || '{}') as HeatStartOverrides } catch { return {} }
}

/**
 * Moves every heat's own start time by however far the workout's start moved.
 * An override is a full timestamp, so without this a workout moved to another
 * day left its edited heats behind on the old one. Returns null when there is
 * nothing to move: no overrides, the same start, or no start on either side
 * (with no old start there is no distance to move them by).
 */
export function shiftHeatStartOverrides(
  overrides: HeatStartOverrides | string | null | undefined,
  oldStartTime: string | Date | null | undefined,
  newStartTime: string | Date | null | undefined,
): HeatStartOverrides | null {
  if (!oldStartTime || !newStartTime) return null
  const delta = new Date(newStartTime).getTime() - new Date(oldStartTime).getTime()
  const parsed = parseOverrides(overrides)
  if (!Number.isFinite(delta) || delta === 0 || Object.keys(parsed).length === 0) return null
  return Object.fromEntries(
    Object.entries(parsed).map(([heat, iso]) => [heat, new Date(new Date(iso).getTime() + delta).toISOString()]),
  )
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
