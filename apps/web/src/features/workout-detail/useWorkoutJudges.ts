import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDel, apiGet, apiPost } from '@/lib/api'
import { queryKeys } from '@/api/queryKeys'
import { useVolunteerRoles } from '@/api/volunteerRoles'
import { volunteersOptions } from '@/api/volunteers'

// v1: the judge half of src/app/[slug]/admin/workouts/[id]/page.tsx, lifted out
// of the page because the page is already the largest file in this slice.
//
// The assignments are a query of their own, keyed per workout; the volunteers
// and the roles are the shared queries the people screen reads, so opening a
// workout after the roster asks for neither again. v1's swallowed read failure
// is kept: the scores half of the screen works without the judges, so a failed
// read leaves the lanes unjudged and silent.
//
// One departure: v1 read `/api/settings` in the same Promise.all to find the
// consecutive-heat limit, which meant a failed settings read also cost the
// screen its judges. The limit is a competition-wide setting several screens
// share, so it comes from the settings query and is passed to `generate`.

export type Judge = { id: number; name: string }
export type JudgeAssignment = {
  id: number; volunteerId: number; heatNumber: number; lane: number; judgeName: string
}
export type LaneJudge = { volunteerId: number; assignmentId: number; judgeName: string }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

type LanePick = { heatNumber: number; lane: number; volunteerId: number | null; existingId?: number }

export function useWorkoutJudges(workoutId: string, slug: string) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const base = `/api/workouts/${workoutId}/judge-assignments?slug=${slug}`
  const key = queryKeys.judgeAssignments(slug, workoutId)

  const assignmentsQuery = useQuery({
    queryKey: key,
    queryFn: () => apiGet<JudgeAssignment[]>(base),
    enabled: !!slug && !!workoutId,
  })
  const rolesQuery = useVolunteerRoles(slug)
  const volunteersQuery = useQuery(volunteersOptions(slug))

  const assignments = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data])
  const allVolunteers = volunteersQuery.data ?? []

  const judgeRoleIds = new Set(
    (rolesQuery.data ?? []).filter((r) => r.name.toLowerCase() === 'judge').map((r) => r.id),
  )
  const judges: Judge[] = allVolunteers.filter((v) => v.roleId != null && judgeRoleIds.has(v.roleId))
  const volunteers: Judge[] = allVolunteers

  /** The lane changes as it is picked: the row is built from the volunteers
      already read (the server upserts on heat and lane and answers with the
      row id, which is the only thing it knows that this does not), and a
      refusal puts the lane back and says why. */
  const pickMutation = useMutation({
    mutationFn: ({ heatNumber, lane, volunteerId, existingId }: LanePick) =>
      volunteerId === null
        ? apiDel(base, { ids: [existingId] })
        : apiPost<{ id: number }>(base, { volunteerId, heatNumber, lane }),
    onMutate: async ({ heatNumber, lane, volunteerId, existingId }) => {
      setError(null)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<JudgeAssignment[]>(key)
      qc.setQueryData<JudgeAssignment[]>(key, (rows = []) => {
        if (volunteerId === null) return rows.filter((a) => a.id !== existingId)
        const judgeName = allVolunteers.find((v) => v.id === volunteerId)?.name ?? ''
        return [
          ...rows.filter((a) => !(a.heatNumber === heatNumber && a.lane === lane)),
          { id: -1, volunteerId, heatNumber, lane, judgeName },
        ]
      })
      return { prev }
    },
    onSuccess: (row, { volunteerId, heatNumber, lane }) => {
      if (volunteerId === null) return
      const { id } = row as { id: number }
      qc.setQueryData<JudgeAssignment[]>(key, (rows = []) =>
        rows.map((a) => (a.heatNumber === heatNumber && a.lane === lane ? { ...a, id } : a)))
    },
    onError: (e, _pick, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      setError(message(e))
    },
  })

  /** A null volunteer empties the lane; anything else claims it. */
  const setJudge = useCallback(async (heatNumber: number, lane: number, volunteerId: number | null) => {
    if (volunteerId === null) {
      const existing = (qc.getQueryData<JudgeAssignment[]>(key) ?? [])
        .find((a) => a.heatNumber === heatNumber && a.lane === lane)
      if (!existing) return
      await pickMutation.mutateAsync({ heatNumber, lane, volunteerId, existingId: existing.id }).catch(() => {})
      return
    }
    await pickMutation.mutateAsync({ heatNumber, lane, volunteerId }).catch(() => {})
    // The refusal is recorded by onError; the picker is not a dialog, so
    // nothing upstream needs the rejection itself.
  }, [pickMutation, qc, key])

  // generate and clear rethrow after recording the error: both can run behind
  // a ConfirmDialog, which needs the real rejection to hold the prompt open,
  // while the error state serves the direct, non-dialog call.
  const generateMutation = useMutation({
    mutationFn: (maxConsecutive: number) =>
      apiPost<JudgeAssignment[]>(
        `/api/workouts/${workoutId}/judge-assignments/generate?slug=${slug}`,
        { maxConsecutive },
      ),
    onMutate: () => setError(null),
    onSuccess: (rows) => qc.setQueryData(key, rows),
    onError: (e) => setError(message(e)),
  })

  const clearMutation = useMutation({
    // No body: a DELETE that carries one names the assignments to remove,
    // and an absent body is what means "all of them".
    mutationFn: () => apiDel(base),
    onSuccess: () => qc.setQueryData(key, []),
    onError: (e) => setError(message(e)),
  })

  const generate = useCallback(
    (maxConsecutive: number) => generateMutation.mutateAsync(maxConsecutive).then(() => undefined),
    [generateMutation])
  const clear = useCallback(
    () => clearMutation.mutateAsync().then(() => undefined),
    [clearMutation])

  const judgesByLane = useCallback((heatNumber: number) => new Map<number, LaneJudge>(
    assignments
      .filter((a) => a.heatNumber === heatNumber)
      .map((a) => [a.lane, { volunteerId: a.volunteerId, assignmentId: a.id, judgeName: a.judgeName }]),
  ), [assignments])

  return {
    judges, volunteers, assignments, error,
    dismissError: useCallback(() => setError(null), []),
    setJudge, generate, clear, judgesByLane,
  }
}
