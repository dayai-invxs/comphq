import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Dispatch, SetStateAction } from 'react'
import { athletesOptions } from '@/api/athletes'
import { useDivisions } from '@/api/divisions'
import { queryKeys } from '@/api/queryKeys'
import { useVolunteerRoles } from '@/api/volunteerRoles'
import { volunteersOptions } from '@/api/volunteers'

// v1: the top half of src/app/[slug]/admin/people/page.tsx. Four reads, one
// labelled error banner, and one `loading` flag both tabs share — lifted out of
// the page because v1's page was 642 lines and the two tabs it hands these to
// are the bulk of them.
//
// The four reads are the shared queries every other screen goes through, so a
// division added on setup is already here when the roster opens. What v1's
// single `Promise.all` guaranteed is kept on top of them: any read failing
// costs the screen all four and lands in the one banner as `Load: …`, because
// three working tabs around a silent gap is a different screen.

export type Division = { id: number; name: string; order: number }
export type VolunteerRole = { id: number; name: string }
export type Athlete = {
  id: number; name: string; bibNumber: string | null
  divisionId: number | null; division: Division | null; withdrawn: boolean
}
export type Volunteer = { id: number; name: string; roleId: number | null; role: VolunteerRole | null }

export type RunFn = <T>(label: string, op: () => Promise<T>) => Promise<T | undefined>

export function usePeople(slug: string) {
  const qc = useQueryClient()

  const athletesQuery = useQuery(athletesOptions(slug))
  const divisionsQuery = useDivisions(slug)
  const volunteersQuery = useQuery(volunteersOptions(slug))
  const rolesQuery = useVolunteerRoles(slug)

  // Writes hold this while they are out; the reads carry their own pending
  // state, and the two are one flag to the tabs — an empty roster mid-read or
  // mid-import must not draw as "No athletes yet".
  const [writing, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loading = writing
    || athletesQuery.isPending || divisionsQuery.isPending
    || volunteersQuery.isPending || rolesQuery.isPending

  // Any failed read lands in the banner under v1's label. The banner is
  // dismissable; a later failure is a new error instance and comes back.
  const readError = athletesQuery.error ?? divisionsQuery.error
    ?? volunteersQuery.error ?? rolesQuery.error
  useEffect(() => {
    if (readError) setError(`Load: ${readError.message}`)
  }, [readError])

  // Every write on both tabs goes through this, so a failure is named by the
  // step that failed rather than by the URL that answered. Returning undefined
  // rather than rethrowing is what lets a caller write `if (!await run(…)) return`.
  const run = useCallback(async function run<T>(label: string, op: () => Promise<T>): Promise<T | undefined> {
    setError(null)
    try { return await op() }
    catch (e) { setError(`${label}: ${e instanceof Error ? e.message : String(e)}`); return undefined }
  }, [])

  const reload = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.athletes(slug) }),
      qc.invalidateQueries({ queryKey: queryKeys.divisions(slug) }),
      qc.invalidateQueries({ queryKey: queryKeys.volunteers(slug) }),
      qc.invalidateQueries({ queryKey: queryKeys.volunteerRoles(slug) }),
    ])
  }, [qc, slug])

  // The tabs' optimistic writes edit the cached roster where a useState
  // version edited local state; the setState signature is kept so they cannot
  // tell the difference.
  const setAthletes: Dispatch<SetStateAction<Athlete[]>> = useCallback((next) => {
    qc.setQueryData<Athlete[]>(queryKeys.athletes(slug), (prev) =>
      typeof next === 'function' ? next(prev ?? []) : next)
  }, [qc, slug])

  const setVolunteers: Dispatch<SetStateAction<Volunteer[]>> = useCallback((next) => {
    qc.setQueryData<Volunteer[]>(queryKeys.volunteers(slug), (prev) =>
      typeof next === 'function' ? next(prev ?? []) : next)
  }, [qc, slug])

  return {
    athletes: athletesQuery.data ?? [],
    divisions: divisionsQuery.data ?? [],
    volunteers: volunteersQuery.data ?? [],
    roles: rolesQuery.data ?? [],
    loading, setLoading, error, setError,
    run, reload, setAthletes, setVolunteers,
  }
}
