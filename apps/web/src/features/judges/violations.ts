// Copied from v1's JudgeScheduleView.findViolations. It answers one question —
// which judge is standing at a lane for more heats in a row than the
// competition allows — and it is the only rule this screen carries, so it has
// its own test rather than being asserted through the page.
//
// The run is per workout: a judge who finishes workout 1 on their limit starts
// workout 2 with a clean count, because they have had the reset a workout
// changeover gives them.

export interface JudgeAssignment {
  judgeId: number
  judgeName: string
  lane: number
}

export interface JudgeHeat {
  heatNumber: number
  heatTimeMs: number | null
  walkoutTimeMs: number | null
  assignments: JudgeAssignment[]
}

export interface JudgeWorkout {
  id: number
  number: number
  name: string
  locationName: string | null
  heats: JudgeHeat[]
}

export interface Judge {
  id: number
  name: string
}

export interface JudgeScheduleData {
  judges: Judge[]
  workouts: JudgeWorkout[]
}

/** Keys of the form `${workoutId}-${judgeId}-${heatNumber}` for every heat past
    the limit, the one that reaches it included going forward. */
export function findViolations(workouts: JudgeWorkout[], maxConsecutive: number): Set<string> {
  const violations = new Set<string>()
  for (const wk of workouts) {
    const judgeHeats = new Map<number, number[]>()
    for (const heat of wk.heats) {
      for (const a of heat.assignments) {
        if (!judgeHeats.has(a.judgeId)) judgeHeats.set(a.judgeId, [])
        judgeHeats.get(a.judgeId)!.push(heat.heatNumber)
      }
    }
    for (const [judgeId, heats] of judgeHeats) {
      heats.sort((a, b) => a - b)
      let run = 1
      for (let i = 0; i < heats.length; i++) {
        if (i > 0 && heats[i] === heats[i - 1] + 1) {
          run++
        } else {
          run = 1
        }
        if (run > maxConsecutive) {
          violations.add(`${wk.id}-${judgeId}-${heats[i]}`)
        }
      }
    }
  }
  return violations
}
