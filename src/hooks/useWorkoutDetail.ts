'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { HttpError } from '@/lib/http'
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
  id: number; number: number; name: string; scoreType: string; lanes: number
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

export function useWorkoutDetail(workoutId: string, opts: Options) {
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [savingHeats, setSavingHeats] = useState<Set<number>>(() => new Set())

  const { slug } = opts
  const api = useMemo(() => buildWorkoutMutations(workoutId, slug), [workoutId, slug])

  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts }, [opts])

  const onSuccess = useCallback((m: string) => {
    setMsg(m); setError('')
    optsRef.current.onSuccess?.(m)
  }, [])

  const load = useCallback(async () => {
    try {
      const data = await api.load<Workout>()
      setWorkout(data)
      return data
    } catch {
      optsRef.current.onNotFound()
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  const setStatus = useCallback(async (status: string) => {
    try { await api.setStatus(status); await load() }
    catch (e) { setError(errorMessage(e)) }
  }, [api, load])

  const generateAssignments = useCallback(async (useCumulative: boolean) => {
    setLoading(true); setMsg(''); setError('')
    try {
      await api.generateAssignments(useCumulative)
      await load()
      onSuccess('Heat assignments generated.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [api, load, onSuccess])

  const saveHeatTime = useCallback(async (heatNumber: number, isoTime: string) => {
    try { await api.saveHeatTime(heatNumber, isoTime); await load() }
    catch (e) { setError(errorMessage(e)) }
  }, [api, load])

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
      setWorkout((prev) => (prev ? { ...prev, assignments: freshAssignments } : prev))
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

  const saveMany = useCallback(async (payloads: ScorePayload[], successMsg: string) => {
    setLoading(true); setError('')
    try {
      await api.saveAll(payloads)
      await load()
      onSuccess(successMsg)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [api, load, onSuccess])

  const completeHeat = useCallback(async (heatNumber: number, payloads: ScorePayload[]) => {
    setLoading(true); setError('')
    try {
      await api.saveAll(payloads)
      await api.completeHeat(heatNumber)
      onSuccess(`Heat ${heatNumber} completed. Rankings updated.`)
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [api, load, onSuccess])

  const undoHeat = useCallback(async (heatNumber: number) => {
    setLoading(true); setError('')
    try {
      await api.undoHeat(heatNumber)
      onSuccess(`Heat ${heatNumber} reopened.`)
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [api, load, onSuccess])

  const clearScores = useCallback(async () => {
    setLoading(true); setError('')
    try {
      await api.clearScores()
      onSuccess('All scores cleared.')
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [api, load, onSuccess])

  const calculateRankings = useCallback(async (payloads: ScorePayload[]) => {
    setLoading(true); setError('')
    try {
      // Saves first; if any fail, we bail BEFORE calculating. This is the
      // whole point of the refactor — a partial save used to leave the
      // workout half-ranked with silent errors in the console.
      await api.saveAll(payloads)
      await api.calculate()
      onSuccess('Rankings calculated. Workout marked as completed.')
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [api, load, onSuccess])

  const deleteWorkout = useCallback(async () => {
    try { await api.deleteWorkout() }
    catch (e) { setError(errorMessage(e)) }
  }, [api])

  const updateSettings = useCallback(async (patch: Record<string, unknown>) => {
    setLoading(true); setError('')
    try {
      await api.updateSettings(patch)
      onSuccess('Settings saved.')
      await load()
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      setLoading(false)
    }
  }, [api, load, onSuccess])

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
    calculateRankings,
    deleteWorkout,
    updateSettings,
  }
}
