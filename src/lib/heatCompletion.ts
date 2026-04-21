import { supabase } from '@/lib/supabase'

/**
 * Fetch completed heat numbers for a single workout from the HeatCompletion
 * table. Replaces the old JSON-parse-of-text pattern.
 */
export async function getCompletedHeats(workoutId: number): Promise<number[]> {
  const { data } = await supabase
    .from('HeatCompletion')
    .select('heatNumber')
    .eq('workoutId', workoutId)
  return ((data ?? []) as { heatNumber: number }[])
    .map((r) => r.heatNumber)
    .sort((a, b) => a - b)
}

/**
 * Bulk version: returns a Map<workoutId, sorted number[]> for all workoutIds
 * passed in. Used by /api/ops and /api/schedule which fetch many workouts.
 */
export async function getCompletedHeatsByWorkout(
  workoutIds: number[],
): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>()
  for (const id of workoutIds) result.set(id, [])
  if (workoutIds.length === 0) return result

  const { data } = await supabase
    .from('HeatCompletion')
    .select('workoutId, heatNumber')
    .in('workoutId', workoutIds)

  for (const row of ((data ?? []) as { workoutId: number; heatNumber: number }[])) {
    const list = result.get(row.workoutId)
    if (list) list.push(row.heatNumber)
  }
  for (const [, arr] of result) arr.sort((a, b) => a - b)
  return result
}
