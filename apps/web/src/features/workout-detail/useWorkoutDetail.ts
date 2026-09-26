'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HttpError } from '@/lib/http'
import { queryKeys } from '@/api/queryKeys'
import { buildWorkoutMutations } from './useWorkoutDetail.mutations'
import { computeAssignmentUpdates, getAffectedHeats } from '@/lib/heat-reorder'

type Division = { id: number; name: string; order: number }
type Athlete = { id: number; name: string; bibNumber: string | null; division: Division | null }
export type Assignment = { id: number; heatNumber: number; lane: number; athlete: Athlete }
export type Score = {
  id: number; athleteId: number; rawScore: number; tiebreakRawScore: number | null
  points: number | null; partBRawScore: number | null; partBPoints: number | null; athlete: Athlete
}
export type Workout = {
  id: number; number: number; name: string; description: string | null; scoreType: string; lanes: number
  heatIntervalSecs: number; timeBetweenHeatsSecs: number; callTimeSecs: number; walkoutTimeSecs: number
  startTime: string | null; status: string; mixedHeats: boolean; tiebreakEnabled: boolean; tiebreakScoreType: string
  partBEnabled: boolean; partBScoreType: string; halfWeight: boolean; locationId: number | null; heatStartOverrides: Record<string, string> | string
  completedHeats: number[]
  assignments: Assignment[]; scores: Score[]
}

export type ScorePayload = {
  athleteId: number
  rawScore: number
  tiebreakRawScore: number | null
  partBRawScore: number | null
}

type Options = {
  slug: string
  onNotFound: () => void
  onSuccess?: (msg: string) => void
}

function errorMessage(e: unknown): string {
  if (e instanceof HttpError) return e.message || `HTTP ${e.status}`
  if (e instanceof Error) return e.message
  return 'Unknown error'
}

// The workout is a query keyed per slug and id; every write below invalidates
// that key and stays pending until the re-read lands, which is what the old
// hand-rolled `await load()` in each write gave the loading flag. The HTTP
// surface stays in buildWorkoutMutations, where it is unit-tested alone.
export function useWorkoutDetail(workoutId: string, opts: Options) {
  const qc = useQueryClient()
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [savingHeats, setSavingHeats] = useState<Set<number>>(() => new Set())

  const { slug } = opts
  const api = useMemo(() => buildWorkoutMutations(workoutId, slug), [workoutId, slug])
  const key = queryKeys.workout(slug, workoutId)

  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts }, [opts])

  const workoutQuery = useQuery({
    queryKey: key,
    queryFn: () => api.load<Workout>(),
    enabled: !!slug && !!workoutId,
    // v1 read once and reported. A 404 must bounce the admin to the list at
    // once, not after a retry of a workout that is gone.
    retry: false,
  })
  const workout = workoutQuery.data ?? null

  const readError = workoutQuery.error
  useEffect(() => {
    if (!readError) return
    // Only a real 404 means the workout is gone. A transient failure used to
    // take this same exit and silently bounce the admin to the list.
    if (readError instanceof HttpError && readError.status === 404) optsRef.current.onNotFound()
    else setError(errorMessage(readError))
  }, [readError])

  const load = useCallback(
    () => qc.invalidateQueries({ queryKey: queryKeys.workout(slug, workoutId) }),
    [qc, slug, workoutId])

  const onSuccess = useCallback((m: string) => {
    setMsg(m); setError('')
    optsRef.current.onSuccess?.(m)
  }, [])

  // Every mutation carries its own onError, which besides filling the banner
  // is what tells the global MutationCache not to toast the failure too.
  const statusMutation = useMutation({
    mutationFn: (status: string) => api.setStatus(status),
    onMutate: () => setError(''),
    onSuccess: () => load(),
    onError: (e) => setError(errorMessage(e)),
  })

  const generateAssignmentsMutation = useMutation({
    mutationFn: (useCumulative: boolean) => api.generateAssignments(useCumulative),
    onMutate: () => { setMsg(''); setError('') },
    onSuccess: async () => { await load(); onSuccess('Heat assignments generated.') },
    onError: (e) => setError(errorMessage(e)),
  })

  const saveHeatTimeMutation = useMutation({
    mutationFn: ({ heatNumber, isoTime }: { heatNumber: number; isoTime: string }) =>
      api.saveHeatTime(heatNumber, isoTime),
    onMutate: () => setError(''),
    onSuccess: () => load(),
    onError: (e) => setError(errorMessage(e)),
  })

  const saveManyMutation = useMutation({
    mutationFn: ({ payloads }: { payloads: ScorePayload[]; successMsg: string }) =>
      api.saveAll(payloads),
    onMutate: () => setError(''),
    onSuccess: async (_data, { successMsg }) => { await load(); onSuccess(successMsg) },
    onError: (e) => setError(errorMessage(e)),
  })

  const completeHeatMutation = useMutation({
    // The saves and the completion are one act: if any save fails, the heat
    // must not close over a half-written set of scores.
    mutationFn: async ({ heatNumber, payloads }: { heatNumber: number; payloads: ScorePayload[] }) => {
      await api.saveAll(payloads)
      await api.completeHeat(heatNumber)
    },
    onMutate: () => setError(''),
    onSuccess: async (_data, { heatNumber }) => {
      onSuccess(`Heat ${heatNumber} completed. Rankings updated.`)
      await load()
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const undoHeatMutation = useMutation({
    mutationFn: (heatNumber: number) => api.undoHeat(heatNumber),
    onMutate: () => setError(''),
    onSuccess: async (_data, heatNumber) => {
      onSuccess(`Heat ${heatNumber} reopened.`)
      await load()
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const calculateMutation = useMutation({
    // Saves first; if any fail, we bail BEFORE calculating. This is the
    // whole point of the refactor — a partial save used to leave the
    // workout half-ranked with silent errors in the console.
    mutationFn: async (payloads: ScorePayload[]) => {
      await api.saveAll(payloads)
      await api.calculate()
    },
    onMutate: () => setError(''),
    onSuccess: async () => {
      onSuccess('Rankings calculated. Workout marked as completed.')
      await load()
    },
    onError: (e) => setError(errorMessage(e)),
  })

  // clearScores, resetWorkout and deleteWorkout run behind a ConfirmDialog,
  // whose contract needs the real rejection: a swallowed error resolves, and a
  // resolved action is indistinguishable from a write that landed. The error
  // state is still set for the banner behind the prompt.
  const clearScoresMutation = useMutation({
    mutationFn: () => api.clearScores(),
    onMutate: () => setError(''),
    onSuccess: async () => { onSuccess('All scores cleared.'); await load() },
    onError: (e) => setError(errorMessage(e)),
  })

  const resetWorkoutMutation = useMutation({
    mutationFn: () => api.resetWorkout(),
    onMutate: () => setError(''),
    onSuccess: async () => {
      onSuccess('Workout reset. All scores cleared and heats reopened.')
      await load()
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const deleteWorkoutMutation = useMutation({
    mutationFn: () => api.deleteWorkout(),
    onError: (e) => setError(errorMessage(e)),
  })

  const updateSettingsMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.updateSettings(patch),
    onMutate: () => setError(''),
    onSuccess: async () => { onSuccess('Settings saved.'); await load() },
    onError: (e) => setError(errorMessage(e)),
  })

  // Reorder runs through TanStack useMutation so we can track per-heat
  // "saving" state via onMutate/onSettled. onSuccess consumes the server's
  // authoritative ordered rows directly — no second GET round-trip, no jitter.
  // The previous optimistic approach was removed in favor of full skeleton
  // replacement (affected heats shimmer during flight); that decision is
  // documented in the plan.
  const reorderMutation = useMutation({
    mutationFn: (vars: { dragId: number; destHeat: number; destIndex: number }) => {
      if (!workout) throw new Error('No workout loaded')
      const updates = computeAssignmentUpdates(
        workout.assignments, vars.dragId, vars.destHeat, vars.destIndex,
      )
      return api.reorderAssignments(updates) as Promise<Assignment[]>
    },
    onMutate: (vars) => {
      if (!workout) return
      setError('')
      setSavingHeats(new Set(getAffectedHeats(workout.assignments, vars.dragId, vars.destHeat)))
    },
    onSuccess: (freshAssignments) => {
      qc.setQueryData<Workout>(key, (prev) =>
        prev ? { ...prev, assignments: freshAssignments } : prev)
    },
    onError: (e) => {
      setError(`Reorder failed: ${errorMessage(e)}`)
    },
    onSettled: () => {
      setSavingHeats(new Set())
    },
  })

  const reorderAssignments = useCallback((dragId: number, destHeat: number, destIndex: number) => {
    if (!workout) return
    const updates = computeAssignmentUpdates(workout.assignments, dragId, destHeat, destIndex)
    if (updates.length === 0) return
    reorderMutation.mutate({ dragId, destHeat, destIndex })
  }, [workout, reorderMutation])

  // The wrappers keep the hook's old signatures. The ones without a dialog
  // spend the rejection — onError has already put it in the banner — and the
  // three behind a ConfirmDialog let it travel.
  const { mutateAsync: setStatusAsync } = statusMutation
  const setStatus = useCallback(
    (status: string) => setStatusAsync(status).then(() => undefined, () => undefined), [setStatusAsync])

  const { mutateAsync: generateAsync } = generateAssignmentsMutation
  const generateAssignments = useCallback(
    (useCumulative: boolean) => generateAsync(useCumulative).then(() => undefined, () => undefined), [generateAsync])

  const { mutateAsync: saveHeatTimeAsync } = saveHeatTimeMutation
  const saveHeatTime = useCallback(
    (heatNumber: number, isoTime: string) =>
      saveHeatTimeAsync({ heatNumber, isoTime }).then(() => undefined, () => undefined), [saveHeatTimeAsync])

  const { mutateAsync: saveManyAsync } = saveManyMutation
  const saveMany = useCallback(
    (payloads: ScorePayload[], successMsg: string) =>
      saveManyAsync({ payloads, successMsg }).then(() => undefined, () => undefined), [saveManyAsync])

  const { mutateAsync: completeHeatAsync } = completeHeatMutation
  const completeHeat = useCallback(
    (heatNumber: number, payloads: ScorePayload[]) =>
      completeHeatAsync({ heatNumber, payloads }).then(() => undefined, () => undefined), [completeHeatAsync])

  const { mutateAsync: undoHeatAsync } = undoHeatMutation
  const undoHeat = useCallback(
    (heatNumber: number) => undoHeatAsync(heatNumber).then(() => undefined, () => undefined), [undoHeatAsync])

  const { mutateAsync: calculateAsync } = calculateMutation
  const calculateRankings = useCallback(
    (payloads: ScorePayload[]) => calculateAsync(payloads).then(() => undefined, () => undefined), [calculateAsync])

  const { mutateAsync: clearScoresAsync } = clearScoresMutation
  const clearScores = useCallback(
    () => clearScoresAsync().then(() => undefined), [clearScoresAsync])

  const { mutateAsync: resetWorkoutAsync } = resetWorkoutMutation
  const resetWorkout = useCallback(
    () => resetWorkoutAsync().then(() => undefined), [resetWorkoutAsync])

  const { mutateAsync: deleteWorkoutAsync } = deleteWorkoutMutation
  const deleteWorkout = useCallback(
    () => deleteWorkoutAsync().then(() => undefined), [deleteWorkoutAsync])

  const { mutateAsync: updateSettingsAsync } = updateSettingsMutation
  const updateSettings = useCallback(
    (patch: Record<string, unknown>) =>
      updateSettingsAsync(patch).then(() => true).catch(() => false), [updateSettingsAsync])

  // Reorder and delete kept themselves out of the shared flag before the
  // migration too: reorder has savingHeats, and delete's outcome is a
  // navigation, not a redraw.
  const loading =
    statusMutation.isPending || generateAssignmentsMutation.isPending ||
    saveHeatTimeMutation.isPending || saveManyMutation.isPending ||
    completeHeatMutation.isPending || undoHeatMutation.isPending ||
    calculateMutation.isPending || clearScoresMutation.isPending ||
    resetWorkoutMutation.isPending || updateSettingsMutation.isPending

  return {
    workout,
    loading,
    msg,
    error,
    savingHeats,
    reorderError: reorderMutation.error,
    setMsg,
    load,
    setStatus,
    generateAssignments,
    saveHeatTime,
    reorderAssignments,
    saveMany,
    completeHeat,
    undoHeat,
    clearScores,
    resetWorkout,
    calculateRankings,
    deleteWorkout,
    updateSettings,
  }
}
