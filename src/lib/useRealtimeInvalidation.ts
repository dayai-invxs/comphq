'use client'

import { useEffect, useRef } from 'react'
import { getSupabaseClient } from './supabase-client'

/**
 * Subscribe to Postgres change events on Score + HeatCompletion for the
 * tables that drive live leaderboard / ops views, and call `onChange` as
 * soon as a row is inserted / updated / deleted.
 *
 * Designed to pair with an existing polling fetcher: use it to trigger
 * immediate refetches on DB events, and let the polling interval stay as
 * a safety net (catches missed events during reconnect).
 *
 * Requires RLS policies granting `anon` SELECT on Score + HeatCompletion,
 * plus the tables being in the `supabase_realtime` publication.
 */
export function useRealtimeInvalidation(onChange: () => void): void {
  // Ref so the effect doesn't re-subscribe every render if the caller
  // passes an inline function.
  const cbRef = useRef(onChange)
  useEffect(() => { cbRef.current = onChange }, [onChange])

  useEffect(() => {
    let client
    try {
      client = getSupabaseClient()
    } catch (e) {
      // If env is missing or WS fails, fall back silently to polling — the
      // page still works, it just won't have sub-second updates.
      console.error('[realtime] client init failed, polling will carry:', e)
      return
    }
    const channel = client
      .channel('public-leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Score' }, () => cbRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'HeatCompletion' }, () => cbRef.current())
      .subscribe()

    return () => { void client.removeChannel(channel) }
  }, [])
}
