import { z } from 'zod'

/**
 * The shape of a Competition Corner event as the import reads it. The admin's
 * browser fetches the event from Competition Corner's public API and posts it
 * with the request: Competition Corner sits behind Cloudflare, which refuses
 * requests from the Edge Functions' data-centre addresses (403) but serves
 * browsers, and its API answers any origin (Access-Control-Allow-Origin: *).
 *
 * So the posted event is admin input. It is validated here like any other
 * body, and only the fields the import uses are kept; zod strips the rest,
 * which also drops athletes' social links and avatars.
 */

const Division = z.object({
  id: z.number(),
  title: z.string(),
  format: z.string(),
})

/** A schedule workout with the time cap from its workout page folded in. */
const Workout = z.object({
  id: z.number(),
  name: z.string(),
  format: z.string(),
  type: z.string(),
  tiebreakerType: z.string().nullable(),
  location: z.string().nullable(),
  /** Local midnight of the workout's day, no offset: "2026-04-25T00:00:00". */
  date: z.string(),
  description: z.string().nullable(),
  /** "HH:MM:SS", or null when the workout has no cap. */
  timeCap: z.string().nullable(),
})

const Station = z.object({
  station: z.number(),
  participantId: z.number(),
  participantName: z.string(),
  divisionId: z.number(),
  affiliate: z.string().nullable(),
})

const Heat = z.object({
  id: z.number(),
  title: z.string(),
  /** Local "HH:MM" on the workout's day. The source sometimes pads it. */
  time: z.string().transform((s) => s.trim()),
  size: z.number(),
  workoutId: z.number(),
  stations: z.array(Station),
})

const Event = z.object({
  id: z.number(),
  name: z.string(),
  divisions: z.array(Division),
  workouts: z.array(Workout),
  heats: z.array(Heat),
})

export type CcDivision = z.infer<typeof Division>
export type CcStation = z.infer<typeof Station>
export type CcHeat = z.infer<typeof Heat>
export type CcWorkout = z.infer<typeof Workout>
export type CcEvent = z.infer<typeof Event>

/** The posted event, or the first place it does not match. */
export function parseEvent(raw: unknown): { ok: true; event: CcEvent } | { ok: false; where: string } {
  const parsed = Event.safeParse(raw)
  if (parsed.success) return { ok: true, event: parsed.data }
  return { ok: false, where: parsed.error.issues[0]?.path.join('.') || 'the event' }
}
