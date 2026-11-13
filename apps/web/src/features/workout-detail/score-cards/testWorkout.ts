import type { Assignment, Workout } from '@/features/workout-detail/useWorkoutDetail'

// A workout as the detail read returns it, with only what the cards read.

type Lane = { heat: number; lane: number; athleteId: number; name: string; division?: string; bib?: string | null
  gender?: string | null; members?: { id: number; name: string; gender?: string | null }[]; memberId?: number | null; round?: number; consolation?: boolean }

export function testWorkout(lanes: Lane[], extra: Partial<Workout> = {}): Workout {
  const assignments: Assignment[] = lanes.map((l, i) => ({
    id: i + 1,
    heatNumber: l.heat,
    lane: l.lane,
    teamMemberId: l.memberId ?? null,
    round: l.round ?? null,
    consolation: l.consolation ?? false,
    athlete: {
      id: l.athleteId,
      name: l.name,
      bibNumber: l.bib ?? null,
      division: l.division ? { id: 1, name: l.division, order: 0 } : null,
      memberList: l.members,
      members: l.members?.map((m) => m.name),
      gender: l.gender ?? null,
    },
  }))
  return {
    id: 9, number: 2, name: 'Rainbow Road Rewind', description: null, scoreType: 'time', lanes: 8,
    heatIntervalSecs: 600, timeBetweenHeatsSecs: 0, callTimeSecs: 0, walkoutTimeSecs: 0,
    startTime: null, status: 'active', mixedHeats: false, tiebreakEnabled: false, tiebreakScoreType: 'time',
    partBEnabled: false, partBScoreType: 'time', halfWeight: false, locationId: null, heatStartOverrides: {},
    completedHeats: [], assignments, scores: [],
    ...extra,
  }
}
