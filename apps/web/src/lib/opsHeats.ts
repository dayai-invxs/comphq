import { calcHeatStartMs } from './heatTime'

// The shape /api/ops serves. v1 declared it twice — once in PublicSchedule and
// once in OpsView, identically — because two screens read the same payload.
// One declaration here, so a field the endpoint renames cannot go on
// type-checking against a stale copy on the other screen.

export type HeatEntry = {
  athleteId: number
  athleteName: string
  bibNumber: string | null
  divisionName: string | null
  lane: number
  scoreDisplay: string | null
  tiebreakDisplay: string | null
}

export type Heat = {
  heatNumber: number
  isComplete: boolean
  entries: HeatEntry[]
}

export type WorkoutData = {
  id: number
  number: number
  name: string
  status: string
  locationName: string | null
  startTime: string | null
  heatIntervalSecs: number
  timeBetweenHeatsSecs: number
  callTimeSecs: number
  walkoutTimeSecs: number
  heatStartOverrides: Record<string, string> | string
  heats: Heat[]
}

export type OpsData = {
  workouts: WorkoutData[]
  showBib: boolean
}

// calcHeatStartMs takes five loose arguments in an order nothing enforces.
// Binding them to the workout row once is what stops a screen from passing the
// walkout offset where the interval belongs.
export function getHeatMs(workout: WorkoutData, heatNumber: number): number | null {
  return calcHeatStartMs(
    heatNumber,
    workout.startTime,
    workout.heatIntervalSecs,
    workout.heatStartOverrides,
    workout.timeBetweenHeatsSecs,
  )
}

// When the athletes of a heat are called to the corral and walked out: fixed
// offsets back from the heat start. One definition, so every screen that
// prints them agrees.
export function getCorralMs(workout: Pick<WorkoutData, 'callTimeSecs'>, startMs: number | null): number | null {
  return startMs == null ? null : startMs - workout.callTimeSecs * 1000
}

export function getWalkoutMs(workout: Pick<WorkoutData, 'walkoutTimeSecs'>, startMs: number | null): number | null {
  return startMs == null ? null : startMs - workout.walkoutTimeSecs * 1000
}
