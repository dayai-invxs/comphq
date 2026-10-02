import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPost } from '@/lib/api'
import { HttpError } from '@/lib/http'
import type { ScoreTypeValue } from '@/lib/scoreTypes'
import { queryKeys } from './queryKeys'

// The Competition Corner import on the setup screen. Preview lists what the
// event would change; apply writes the changes the admin kept. Apply rebuilds
// the list on the server and refuses (409) when it no longer matches `version`.

export type CcSource = { url: string; tz: string; mergePartB: boolean }

/** Mirrors `Change` in supabase/functions/_shared/competitionCorner/diff.ts. */
export type CcChange = {
  key: string
  entity: 'division' | 'workout' | 'athlete' | 'heats'
  kind: 'add' | 'update' | 'link' | 'remove'
  id: number | null
  label: string
  fields: { field: string; before: unknown; after: unknown }[]
  warnings: string[]
  requires: string[]
  number?: number
  needsScoreType?: true
}

export type CcPreview = { event: { id: number; name: string }; changes: CcChange[]; version: string }

export type CcSelection = { version: string; accepted: string[]; scoreTypes: Record<string, ScoreTypeValue> }

export function useCcPreview(slug: string) {
  return useMutation({
    mutationFn: (source: CcSource) => apiPost<CcPreview>('/api/import/competition-corner/preview', { slug, ...source }),
  })
}

export function useCcApply(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CcSource & CcSelection) =>
      apiPost<{ applied: number }>('/api/import/competition-corner/apply', { slug, ...input }),
    onSuccess: () => {
      for (const queryKey of [
        queryKeys.divisions(slug), queryKeys.workouts(slug), queryKeys.workoutLocations(slug),
        queryKeys.athletes(slug), queryKeys.schedule(slug), queryKeys.ops(slug),
      ]) qc.invalidateQueries({ queryKey })
    },
  })
}

/** Apply answers 400 with `{ errors: string[] }` when the selection is incomplete. */
export function applyErrors(e: unknown): string[] {
  if (e instanceof HttpError && e.status === 400) {
    try {
      const body = JSON.parse(e.message) as { errors?: unknown }
      if (Array.isArray(body.errors)) return body.errors.map(String)
    } catch {
      // Not the selection body; the message is the error.
    }
  }
  return [e instanceof Error ? e.message : String(e)]
}
