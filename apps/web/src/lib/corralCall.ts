import type { PendingHeat } from './nowHeat'

// The call to the corral: when a heat's corral time comes, the schedule
// screens tell its athletes to line up. The time is the heat's own corral
// time (`callTimeSecs` before it starts), and the call stays up for a minute.
//
// Only heats still to run are called — `pendingHeats` already drops a heat
// the corral marshal has walked out, so ticking it out ends its call early.

/** How long a call stays on screen. */
export const CORRAL_CALL_MS = 60_000

/** Heats whose corral call is up at `nowMs`, earliest first. */
export function corralCalls(pending: PendingHeat[], nowMs: number): PendingHeat[] {
  return pending.filter((h) => h.corralMs != null && nowMs >= h.corralMs && nowMs < h.corralMs + CORRAL_CALL_MS)
}

/** One heat of one workout: what a dismissal is remembered by. */
export function corralCallKey(h: PendingHeat): string {
  return `${h.workout.id}-${h.heat.heatNumber}`
}

export function corralCallHeadline(h: PendingHeat): string {
  return `It's time for Workout ${h.workout.number} Heat ${h.heat.heatNumber} to line up!`
}

export const CORRAL_CALL_INSTRUCTION = 'Athletes please go to the corral area asap.'
