'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabaseClient } from './supabase'

/**
 * Subscribes to Postgres change events on `Score` + `HeatCompletion`, and on
 * the two `Setting` rows the checks screens live on, and invalidates the
 * given TanStack Query keys when a row event arrives.
 *
 * Invalidation is throttled: the first event of a quiet period refetches
 * immediately (a score lands, the board moves), and everything else inside
 * the window collapses into one trailing refetch when it closes. Without
 * this, a bulk import or a burst of scoring is one leaderboard recomputation
 * per row on every open screen.
 *
 * The Setting subscription is row-filtered to the two keys the public
 * `GET /api/checks` endpoint already serves to anyone. Setting also holds
 * judgePassword — the filter, and the matching row-scoped RLS policy in
 * supabase/migrations, are what keep that out of the socket. Never widen it.
 *
 * Pair with `useQuery` on the public read routes (leaderboard, ops,
 * schedule, checks). The `refetchInterval` on those queries is the safety
 * net when WebSocket reconnects miss an event.
 *
 * Requires RLS policies granting `anon` SELECT on Score + HeatCompletion,
 * and on the two checks rows of Setting (see
 * supabase/migrations/20260421170000_rls_public_read.sql and
 * supabase/migrations/20260830120000_realtime_checks.sql).
 */

const THROTTLE_MS = 2_000

export function useRealtimeInvalidation(queryKeys: readonly (readonly unknown[])[]): void {
  const qc = useQueryClient()

  useEffect(() => {
    let client
    try {
      client = getSupabaseClient()
    } catch (e) {
      console.error('[realtime] client init failed, polling will carry:', e)
      return
    }
    const invalidate = () => {
      for (const key of queryKeys) qc.invalidateQueries({ queryKey: key })
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    let arrivedDuringWindow = false
    const onRowEvent = () => {
      if (timer) {
        arrivedDuringWindow = true
        return
      }
      invalidate()
      timer = setTimeout(() => {
        timer = undefined
        if (arrivedDuringWindow) {
          arrivedDuringWindow = false
          invalidate()
        }
      }, THROTTLE_MS)
    }

    const channel = client
      .channel('public-leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Score' }, onRowEvent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'HeatCompletion' }, onRowEvent)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Setting', filter: 'key=in.(athleteChecks,equipChecks)' },
        onRowEvent,
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      void client.removeChannel(channel)
    }
    // queryKeys is intentionally not a dep — consumers should pass a stable
    // reference. If keys change, unmount/remount is the right signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc])
}
