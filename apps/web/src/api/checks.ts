import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPatch } from '@/lib/api'
import type { ChecksData } from './liveReads'
import { queryKeys } from './queryKeys'

// The two check writers. v1 had one in AthleteControl and one in EquipmentView,
// each a hand-rolled fetch with its own copy of the optimistic cache write, and
// they had already drifted — one spread the old value over the new record, the
// other did not.
//
// A tick is written to the cache first and sent after, because the person
// ticking is standing on the floor and the box has to move under their finger.
// PATCH /api/checks has no auth at all (defect 2). A refused write keeps the
// tick and surfaces on `error`; the next poll is what corrects it.
//
// COM-116: a tick sends one entry, which the server merges into the stored
// map, and ticks on one screen go out one at a time. v1 sent the whole map on
// every tick with nothing ordering the requests, so two quick taps raced and
// the later request to land overwrote the earlier tap with an older copy.

export type AthleteChecks = ChecksData['athleteChecks']
export type EquipChecks = ChecksData['equipChecks']

function useChecksWriter<F extends keyof ChecksData>(
  slug: string,
  type: 'athlete' | 'equipment',
  field: F,
) {
  type Value = ChecksData[F][string]
  const qc = useQueryClient()
  const queryKey = queryKeys.checks(slug)
  const mutation = useMutation({
    mutationFn: (body: { checks: ChecksData[F] } | { entry: { key: string; value: Value } }) =>
      apiPatch('/api/checks', { slug, type, ...body }),
    // Same scope, run in order: an on-then-off pair reaches the server as sent.
    scope: { id: `checks-${slug}-${type}` },
  })

  const read = () => qc.getQueryData<ChecksData>(queryKey)?.[field] ?? ({} as ChecksData[F])

  const write = (map: ChecksData[F]) => {
    // A poll already in flight would land the pre-tick map over the tick.
    void qc.cancelQueries({ queryKey })
    qc.setQueryData(queryKey, (old: ChecksData | undefined) => ({
      athleteChecks: old?.athleteChecks ?? {},
      equipChecks: old?.equipChecks ?? {},
      [field]: map,
    }))
  }

  return {
    /** One tick, computed from the cache at the moment of the tap. */
    setEntry: (key: string, next: (old: Value | undefined) => Value) => {
      const value = next(read()[key] as Value | undefined)
      write({ ...read(), [key]: value })
      mutation.mutate({ entry: { key, value } })
    },
    /**
     * The whole map, for the reset. The caller gets the real promise — the
     * ConfirmDialog needs the rejection to hold the prompt open.
     */
    setAsync: (checks: ChecksData[F]) => {
      write(checks)
      return mutation.mutateAsync({ checks })
    },
    /** Last write's refusal, for the screens to warn with. */
    error: mutation.error,
    isPending: mutation.isPending,
  }
}

/** Corral and walk-out ticks, keyed `${workoutId}-${heatNumber}`. */
export function useSetAthleteChecks(slug: string) {
  return useChecksWriter(slug, 'athlete', 'athleteChecks')
}

/** Equipment ticks, keyed `${workoutId}-${heatNumber}-${divisionName}`. */
export function useSetEquipChecks(slug: string) {
  return useChecksWriter(slug, 'equipment', 'equipChecks')
}
