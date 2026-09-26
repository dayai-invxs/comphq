import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { queryKeys } from './queryKeys'

// v1: src/lib/queries.ts. The four reads the public screens live on, each
// polling at the rate v1 chose for it — that rate is the screen's promise
// about how stale it can be, not a default anyone picked.
//
// The options are values rather than hook bodies so a test can read them
// without rendering, and so Phase 7's realtime invalidation can name the same
// keys the polling uses.

const options = <T>(key: readonly unknown[], path: string, refetchInterval: number) => ({
  queryKey: key,
  queryFn: () => apiGet<T>(path),
  refetchInterval,
})

// v1 declared the leaderboard's shape here and left the other three to their
// callers, because only this one is read by more than one screen — the public
// table and the TV scoreboard.
export type WorkoutSummary = {
  id: number
  number: number
  name: string
  scoreType: string
  status: string
  partBEnabled?: boolean
}
export type WorkoutScore = {
  points: number
  display: string
  tiebreakDisplay: string | null
  partBPoints?: number | null
} | null
export type LeaderboardEntry = {
  athleteId: number
  athleteName: string
  divisionName: string | null
  totalPoints: number
  workoutScores: Record<number, WorkoutScore>
}
export type LeaderboardData = {
  workouts: WorkoutSummary[]
  entries: LeaderboardEntry[]
  halfWeightIds: number[]
  tiebreakWorkoutId?: number | null
  tvLeaderboardPercentages?: Record<string, number>
  tvLeaderboardOrder?: Record<string, number>
  divisions?: { name: string; order: number }[]
}

/** Standings. Slower than the operational screens: a placing only moves when
    a score lands. */
export const leaderboardOptions = (slug: string) => ({
  ...options<LeaderboardData>(queryKeys.leaderboard(slug), `/api/leaderboard?slug=${slug}`, 15_000),
  enabled: !!slug,
})

/** Heats, lanes and athletes — what the floor is doing now. */
export const opsOptions = <T>(slug: string) => ({
  ...options<T>(queryKeys.ops(slug), `/api/ops?slug=${slug}`, 10_000),
  enabled: !!slug,
})

export const scheduleOptions = <T>(slug: string) => ({
  ...options<T>(queryKeys.schedule(slug), `/api/schedule?slug=${slug}`, 10_000),
  enabled: !!slug,
})

/** Corral, walkout and equipment ticks. Two people tick these at once from
    opposite ends of a floor. v1 polled at 3s to carry that; the realtime
    subscription on the two checks rows of Setting now delivers the other
    person's tick in under a second, so the poll is only the safety net for a
    dropped socket and runs at the leaderboard's rate. staleTime 0 stays: a
    screen that mounts always asks, it just no longer asks every 3 seconds. */
export const checksOptions = <T>(slug: string) => ({
  ...options<T>(queryKeys.checks(slug), `/api/checks?slug=${slug}`, 15_000),
  enabled: !!slug,
  staleTime: 0,
})

export type ChecksData = {
  athleteChecks: Record<string, { corral: boolean; walkout: boolean }>
  equipChecks: Record<string, boolean>
}

export function useLeaderboard(slug: string) {
  return useQuery(leaderboardOptions(slug))
}

export function useOps<T>(slug: string) {
  return useQuery(opsOptions<T>(slug))
}

export function useSchedule<T>(slug: string) {
  return useQuery(scheduleOptions<T>(slug))
}

export function useChecks(slug: string) {
  return useQuery(checksOptions<ChecksData>(slug))
}
