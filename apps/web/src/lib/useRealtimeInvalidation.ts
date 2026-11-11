'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabaseClient } from './supabase'

/**
 * Listens for "something changed" announcements for one competition and
 * invalidates the given TanStack Query keys when one arrives.
 *
 * Each competition has its own broadcast channel, "competition:<slug>". The
 * database announces on it when a score, a completed heat or a check tick of
 * that competition changes (supabase/migrations/20261110170000_per_competition_live.sql).
 * The announcement carries no data; the screen re-reads through the API, so
 * nothing private travels on the socket. Screens used to subscribe to every
 * such row change across all competitions, so one competition's scoring made
 * every other competition's open screens reload.
 *
 * Invalidation is throttled: the first event of a quiet period refetches
 * immediately (a score lands, the board moves), and everything else inside
 * the window collapses into one trailing refetch when it closes.
 *
 * The `refetchInterval` on the paired queries is the safety net when a
 * WebSocket reconnect misses an event.
 */

const THROTTLE_MS = 2_000

export function useRealtimeInvalidation(slug: string, queryKeys: readonly (readonly unknown[])[]): void {
  const qc = useQueryClient()

  useEffect(() => {
    if (!slug) return
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
      .channel(`competition:${slug}`)
      .on('broadcast', { event: 'changed' }, onRowEvent)
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      void client.removeChannel(channel)
    }
    // queryKeys is intentionally not a dep — consumers should pass a stable
    // reference. If keys change, unmount/remount is the right signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, slug])
}
