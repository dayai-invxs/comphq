export type Setting = { key: string; value: string }

export type Division = { id: number; name: string; order: number }

export type Athlete = {
  id: number
  name: string
  bibNumber: string | null
  divisionId: number | null
  division?: Division | null
}

export type Workout = {
  id: number
  number: number
  name: string
  scoreType: string
  lanes: number
  heatIntervalSecs: number
  timeBetweenHeatsSecs: number
  callTimeSecs: number
  walkoutTimeSecs: number
  startTime: string | null
  status: string
  mixedHeats: boolean
  tiebreakEnabled: boolean
  partBEnabled: boolean
  partBScoreType: string
  heatStartOverrides: string
  completedHeats: string
}

export type HeatAssignment = {
  id: number
  workoutId: number
  athleteId: number
  heatNumber: number
  lane: number
  athlete?: Athlete
  workout?: Workout
}

export type User = { id: number; username: string; password: string }

export type Score = {
  id: number
  athleteId: number
  workoutId: number
  rawScore: number
  tiebreakRawScore: number | null
  points: number | null
  partBRawScore: number | null
  partBPoints: number | null
  athlete?: Athlete
  workout?: Workout
}
