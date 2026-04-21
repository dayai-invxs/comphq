/**
 * Calculate the start time for a given heat, respecting per-heat overrides.
 *
 * workoutStartTime is the base time for heat 1.
 * overridesJson is a JSON object mapping heat number (string) → ISO timestamp.
 *
 * Logic: find the highest-numbered anchor at or before heatNumber, then
 * offset forward by (heatNumber - anchor) × interval.
 * This means editing heat N leaves heats 1..N-1 unchanged and cascades N+1, N+2…
 */
export function calcHeatStartMs(
  heatNumber: number,
  workoutStartTime: string | Date | null,
  heatIntervalSecs: number,
  overridesJson: string,
  timeBetweenHeatsSecs = 0
): number | null {
  if (!workoutStartTime) return null

  const overrides: Record<string, string> = JSON.parse(overridesJson || '{}')

  // Implicit anchor: heat 1 = workoutStartTime
  let bestHeat = 1
  let bestMs = new Date(workoutStartTime).getTime()

  for (const [key, iso] of Object.entries(overrides)) {
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
