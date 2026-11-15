import { drizzleMock as mock } from '@/test/setup'

// Rows for the two export tests, queued in the order lib/competitionExport.ts
// reads them. A table a test leaves out comes back empty.

type Rows = Record<string, unknown>[]
export type ExportTables = Partial<{
  competition: Rows
  workouts: Rows
  divisions: Rows
  athletes: Rows
  teamMembers: Rows
  assignments: Rows
  completions: Rows
  scores: Rows
  settings: Rows
  locations: Rows
  roles: Rows
  volunteers: Rows
  judges: Rows
  equipment: Rows
}>

const ORDER = [
  'competition', 'workouts', 'divisions', 'athletes', 'teamMembers', 'assignments', 'completions',
  'scores', 'settings', 'locations', 'roles', 'volunteers', 'judges', 'equipment',
] as const

export function queueExport(tables: ExportTables) {
  mock.queueResults(...ORDER.map((k) => tables[k] ?? []))
}

/** A workout with every column at its default, as the database returns it. */
export function workoutRow(over: Record<string, unknown>) {
  return {
    id: 10, competitionId: 1, number: 1, name: 'WOD 1', scoreType: 'time', lanes: 6,
    heatIntervalSecs: 600, timeBetweenHeatsSecs: 120, callTimeSecs: 600, walkoutTimeSecs: 120,
    startTime: null, status: 'completed', description: null, mixedHeats: true,
    tiebreakEnabled: false, tiebreakScoreType: 'time', tiebreakBestLane: false, scoreCard: null,
    partBEnabled: false, partBScoreType: 'time', halfWeight: false, doubleWeight: false, pointsStep: null,
    secret: false, knockout: false, knockoutRounds: null, knockoutAdvance: null, knockoutDecides: false,
    knockoutConsolation: false, heatStartOverrides: {}, locationId: null, externalId: null, externalPartBId: null,
    ...over,
  }
}

export function athleteRow(id: number, name: string, divisionId: number | null, over: Record<string, unknown> = {}) {
  return { id, competitionId: 1, name, bibNumber: null, divisionId, userId: null, withdrawn: false, externalId: null, gender: null, ...over }
}

export function scoreRow(athleteId: number, workoutId: number, points: number | null, over: Record<string, unknown> = {}) {
  return {
    id: athleteId * 1000 + workoutId, athleteId, workoutId, rawScore: 200000 + athleteId * 1000, tiebreakRawScore: null,
    points, partBRawScore: null, partBPoints: null, capped: false, partBCapped: false, knockoutLabel: null, ...over,
  }
}

export const RX = { id: 1, competitionId: 1, name: 'Rx', order: 0, externalId: null, teamSize: 1, menCount: null, womenCount: null }
export const SCALED = { ...RX, id: 2, name: 'Scaled', order: 1 }
