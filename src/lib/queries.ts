'use client'

import { useQuery } from '@tanstack/react-query'

// ─── Query keys — one place to mint them so invalidation stays in sync ──
export const qk = {
  leaderboard: (slug: string) => ['leaderboard', slug] as const,
  ops: (slug: string) => ['ops', slug] as const,
  schedule: (slug: string) => ['schedule', slug] as const,
  logo: () => ['logo'] as const,
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json() as Promise<T>
}

// ─── Leaderboard ────────────────────────────────────────────────────────
type WorkoutSummary = { id: number; number: number; name: string; scoreType: string; status: string }
type WorkoutScore = { points: number; display: string; tiebreakDisplay: string | null } | null
type LeaderboardEntry = {
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

export function useLeaderboard(slug: string) {
  return useQuery({
    queryKey: qk.leaderboard(slug),
    queryFn: () => fetchJson<LeaderboardData>(`/api/leaderboard?slug=${slug}`),
    enabled: !!slug,
    refetchInterval: 15_000,
  })
}

// ─── Ops view ───────────────────────────────────────────────────────────
export function useOps<T>(slug: string) {
  return useQuery<T>({
    queryKey: qk.ops(slug),
    queryFn: () => fetchJson<T>(`/api/ops?slug=${slug}`),
    enabled: !!slug,
    refetchInterval: 10_000,
  })
}

// ─── Schedule ───────────────────────────────────────────────────────────
export function useSchedule<T>(slug: string) {
  return useQuery<T>({
    queryKey: qk.schedule(slug),
    queryFn: () => fetchJson<T>(`/api/schedule?slug=${slug}`),
    enabled: !!slug,
    refetchInterval: 10_000,
  })
}

// ─── Logo URL (cross-page; refetched very lazily) ───────────────────────
export function useLogoUrl() {
  return useQuery<{ url: string | null }>({
    queryKey: qk.logo(),
    queryFn: () => fetchJson<{ url: string | null }>('/api/logo'),
    staleTime: 60_000,
  })
}
