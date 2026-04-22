'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabaseClient } from './supabase-client'

/**
 * Subscribes to Postgres change events on `Score` + `HeatCompletion` and
 * invalidates the given TanStack Query keys when any row event arrives.
 *
 * Pair with `useQuery` on the public read routes (leaderboard, ops,
 * schedule). The existing `refetchInterval` on those queries is the
 * safety net when WebSocket reconnects miss an event.
 *
 * Requires RLS policies granting `anon` SELECT on Score + HeatCompletion
 * (see supabase/migrations/20260421170000_rls_public_read.sql).
 */
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
    const channel = client
      .channel('public-leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Score' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'HeatCompletion' }, invalidate)
      .subscribe()

    return () => { void client.removeChannel(channel) }
    // queryKeys is intentionally not a dep — consumers should pass a stable
    // reference. If keys change, unmount/remount is the right signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc])
}
