import { z } from 'zod'

/**
 * Read-only client for Competition Corner's public API — the same JSON its
 * own event pages load, no auth. Each response is validated so a change on
 * their side surfaces as one clear error instead of bad rows on ours.
 *
 * Only the fields the import uses are kept; zod strips the rest, which also
 * drops athletes' social links and avatars.
 */

const BASE = 'https://competitioncorner.net/api2/v1'

export type FetchFn = (input: string) => Promise<Response>

export class CcFetchError extends Error {
  override name = 'CcFetchError'
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

const EVENT_URL = /^(?:https?:\/\/)?(?:www\.)?competitioncorner\.net\/events\/(\d+)(?:[/?#]|$)/i

/** Event id from a pasted event link or a bare id; null when it is neither. */
export function parseEventUrl(input: string): number | null {
  const s = input.trim()
  const m = /^\d+$/.test(s) ? [s, s] : EVENT_URL.exec(s)
  const id = m ? Number(m[1]) : 0
  return id > 0 ? id : null
}

const Division = z.object({
  id: z.number(),
  title: z.string(),
  format: z.string(),
})

const Event = z.object({
  id: z.number(),
  name: z.string(),
  divisions: z.array(Division),
})

const ScheduleWorkout = z.object({
  id: z.number(),
  name: z.string(),
  format: z.string(),
  type: z.string(),
  tiebreakerType: z.string().nullable(),
  location: z.string().nullable(),
  /** Local midnight of the workout's day, no offset: "2026-04-25T00:00:00". */
  date: z.string(),
  description: z.string().nullable(),
})

const ScheduleWorkouts = z.object({ workouts: z.array(ScheduleWorkout) })

const WorkoutPage = z.object({
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

export type CcDivision = z.infer<typeof Division>
export type CcStation = z.infer<typeof Station>
export type CcHeat = z.infer<typeof Heat>
export type CcWorkout = z.infer<typeof ScheduleWorkout> & z.infer<typeof WorkoutPage>

export type CcEvent = {
  id: number
  name: string
  divisions: CcDivision[]
  workouts: CcWorkout[]
  heats: CcHeat[]
}

async function getJson<T>(fetchFn: FetchFn, path: string, schema: z.ZodType<T>): Promise<T> {
  let res: Response
  try {
    res = await fetchFn(`${BASE}/${path}`)
  } catch (e) {
    throw new CcFetchError(`Competition Corner unreachable: ${(e as Error).message}`)
  }
  if (!res.ok) throw new CcFetchError(`Competition Corner ${path} returned ${res.status}`, res.status)

  const parsed = schema.safeParse(await res.json().catch(() => undefined))
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join('.') || 'body'
    throw new CcFetchError(`Competition Corner ${path} changed shape at ${where}`)
  }
  return parsed.data
}

/** Everything the import needs for one event. Independent requests run together. */
export async function fetchEvent(eventId: number, fetchFn: FetchFn = fetch): Promise<CcEvent> {
  const eventP = getJson(fetchFn, `events/${eventId}`, Event)
  const heatsP = getJson(fetchFn, `schedule/events/${eventId}/heats`, z.array(Heat))
  const workoutsP = getJson(fetchFn, `schedule/events/${eventId}/workouts`, ScheduleWorkouts).then(({ workouts }) =>
    Promise.all(workouts.map(async (w) => ({
      ...w,
      ...(await getJson(fetchFn, `events/${eventId}/workouts/${w.id}/public`, WorkoutPage)),
    }))),
  )

  const [event, workouts, heats] = await Promise.all([eventP, workoutsP, heatsP])
  return { id: event.id, name: event.name, divisions: event.divisions, workouts, heats }
}
