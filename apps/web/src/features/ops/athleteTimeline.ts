import { getCorralMs, getHeatMs, getWalkoutMs, type OpsData } from '@/lib/opsHeats'

// Every heat one athlete is in, in the order they will run them. v1's ops
// screen could only be read workout-first, so answering "where is Alice now"
// meant scanning every heat of every workout for her name — which is the
// question a family member in the crowd actually opens the app with.

export type AthleteStop = {
  workoutId: number
  workoutNumber: number
  workoutName: string
  locationName: string | null
  heatNumber: number
  isComplete: boolean
  lane: number
  startMs: number | null
  corralMs: number | null
  walkoutMs: number | null
  scoreDisplay: string | null
  tiebreakDisplay: string | null
}

export type Athlete = {
  athleteId: number
  athleteName: string
  bibNumber: string | null
  divisionName: string | null
  stops: AthleteStop[]
}

/**
 * The competition indexed by athlete rather than by workout, sorted by name.
 *
 * Division and bib are taken from the first heat that names them: an athlete
 * appears once per heat and the payload repeats both on every entry, so the
 * first non-null is the answer and a later blank is not a change of mind.
 */
export function athletesIn(data: OpsData | undefined): Athlete[] {
  const byId = new Map<number, Athlete>()

  for (const workout of data?.workouts ?? []) {
    for (const heat of workout.heats) {
      for (const entry of heat.entries) {
        let athlete = byId.get(entry.athleteId)
        if (!athlete) {
          athlete = {
            athleteId: entry.athleteId,
            athleteName: entry.athleteName,
            bibNumber: entry.bibNumber,
            divisionName: entry.divisionName,
            stops: [],
          }
          byId.set(entry.athleteId, athlete)
        }
        athlete.bibNumber ??= entry.bibNumber
        athlete.divisionName ??= entry.divisionName
        const startMs = getHeatMs(workout, heat.heatNumber)
        athlete.stops.push({
          workoutId: workout.id,
          workoutNumber: workout.number,
          workoutName: workout.name,
          locationName: workout.locationName,
          heatNumber: heat.heatNumber,
          isComplete: heat.isComplete,
          lane: entry.lane,
          startMs,
          corralMs: getCorralMs(workout, startMs),
          walkoutMs: getWalkoutMs(workout, startMs),
          scoreDisplay: entry.scoreDisplay,
          tiebreakDisplay: entry.tiebreakDisplay,
        })
      }
    }
  }

  for (const athlete of byId.values()) {
    // The day in the order it happens. An unscheduled heat has no clock to sort
    // by, so it sits after the ones that do rather than at the front.
    athlete.stops.sort((a, b) => {
      if (a.startMs !== b.startMs) {
        if (a.startMs == null) return 1
        if (b.startMs == null) return -1
        return a.startMs - b.startMs
      }
      return a.workoutNumber - b.workoutNumber || a.heatNumber - b.heatNumber
    })
  }

  return [...byId.values()].sort((a, b) => a.athleteName.localeCompare(b.athleteName))
}

export function matchAthletes(athletes: Athlete[], search: string): Athlete[] {
  const term = search.trim().toLowerCase()
  if (!term) return []
  return athletes.filter(
    (a) =>
      a.athleteName.toLowerCase().includes(term) ||
      (a.bibNumber ?? '').toLowerCase().includes(term),
  )
}
