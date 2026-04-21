'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
  startTime: string | null; status: string; mixedHeats: boolean; tiebreakEnabled: boolean
  partBEnabled: boolean; partBScoreType: string; halfWeight: boolean; heatStartOverrides: string
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

export function useWorkoutDetail(workoutId: string, opts: Options) {
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const { slug } = opts
  const qs = `?slug=${encodeURIComponent(slug)}`

  // Keep the latest callback refs so memoized fetch functions can call them
  // without invalidating on every render of the parent.
  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts }, [opts])

  const onSuccess = useCallback((m: string) => {
    setMsg(m)
    optsRef.current.onSuccess?.(m)
  }, [])

  const load = useCallback(async () => {
    const res = await fetch(`/api/workouts/${workoutId}${qs}`, { cache: 'no-store' })
    if (!res.ok) return optsRef.current.onNotFound()
    const data: Workout = await res.json()
    setWorkout(data)
    return data
  }, [workoutId, qs])

  useEffect(() => { void load() }, [load])

  const setStatus = useCallback(async (status: string) => {
    await fetch(`/api/workouts/${workoutId}${qs}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await load()
  }, [workoutId, qs, load])

  const generateAssignments = useCallback(async (useCumulative: boolean) => {
    setLoading(true); setMsg('')
    const res = await fetch(`/api/workouts/${workoutId}/assignments${qs}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useCumulative }),
    })
    if (res.ok) onSuccess('Heat assignments generated.')
    await load(); setLoading(false)
  }, [workoutId, qs, load, onSuccess])

  const saveHeatTime = useCallback(async (heatNumber: number, isoTime: string) => {
    await fetch(`/api/workouts/${workoutId}/heat-times${qs}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heatNumber, isoTime }),
    })
    await load()
  }, [workoutId, qs, load])

  const saveAssignment = useCallback(async (id: number, heatNumber: number, lane: number) => {
    await fetch(`/api/workouts/${workoutId}/assignments${qs}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, heatNumber, lane }),
    })
    await load()
  }, [workoutId, qs, load])

  const swapAssignments = useCallback(async (aId: number, bId: number) => {
    if (aId === bId || !workout) return
    const a = workout.assignments.find((x) => x.id === aId)
    const b = workout.assignments.find((x) => x.id === bId)
    if (!a || !b) return
    setLoading(true)
    await Promise.all([
      fetch(`/api/workouts/${workoutId}/assignments${qs}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: aId, heatNumber: b.heatNumber, lane: b.lane }),
      }),
      fetch(`/api/workouts/${workoutId}/assignments${qs}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bId, heatNumber: a.heatNumber, lane: a.lane }),
      }),
    ])
    await load(); setLoading(false)
  }, [workoutId, qs, workout, load])

  const saveScorePayload = useCallback(async (payload: ScorePayload) => {
    await fetch(`/api/workouts/${workoutId}/scores${qs}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }, [workoutId, qs])

  const saveMany = useCallback(async (payloads: ScorePayload[], successMsg: string) => {
    setLoading(true)
    await Promise.all(payloads.map(saveScorePayload))
    await load(); setLoading(false); onSuccess(successMsg)
  }, [load, saveScorePayload, onSuccess])

  const completeHeat = useCallback(async (heatNumber: number, payloads: ScorePayload[]) => {
    setLoading(true)
    await Promise.all(payloads.map(saveScorePayload))
    await fetch(`/api/workouts/${workoutId}/heats/${heatNumber}/complete${qs}`, { method: 'POST' })
    onSuccess(`Heat ${heatNumber} completed. Rankings updated.`)
    await load(); setLoading(false)
  }, [workoutId, qs, load, saveScorePayload, onSuccess])

  const undoHeat = useCallback(async (heatNumber: number) => {
    setLoading(true)
    await fetch(`/api/workouts/${workoutId}/heats/${heatNumber}/complete${qs}`, { method: 'DELETE' })
    onSuccess(`Heat ${heatNumber} reopened.`)
    await load(); setLoading(false)
  }, [workoutId, qs, load, onSuccess])

  const clearScores = useCallback(async () => {
    setLoading(true)
    await fetch(`/api/workouts/${workoutId}/scores${qs}`, { method: 'DELETE' })
    onSuccess('All scores cleared.')
    await load(); setLoading(false)
  }, [workoutId, qs, load, onSuccess])

  const calculateRankings = useCallback(async (payloads: ScorePayload[]) => {
    setLoading(true)
    await Promise.all(payloads.map(saveScorePayload))
    const res = await fetch(`/api/workouts/${workoutId}/calculate${qs}`, { method: 'POST' })
    if (res.ok) onSuccess('Rankings calculated. Workout marked as completed.')
    await load(); setLoading(false)
  }, [workoutId, qs, load, saveScorePayload, onSuccess])

  const deleteWorkout = useCallback(async () => {
    await fetch(`/api/workouts/${workoutId}${qs}`, { method: 'DELETE' })
  }, [workoutId, qs])

  // PUT a partial update (settings edit). Returns true on success.
  const updateSettings = useCallback(async (patch: Record<string, unknown>) => {
    setLoading(true)
    const res = await fetch(`/api/workouts/${workoutId}${qs}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      setMsg('Error saving settings.')
      setLoading(false)
      return false
    }
    onSuccess('Settings saved.')
    await load(); setLoading(false)
    return true
  }, [workoutId, qs, load, onSuccess])

  return {
    workout,
    loading,
    msg,
    setMsg,
    load,
    setStatus,
    generateAssignments,
    saveHeatTime,
    saveAssignment,
    swapAssignments,
    saveMany,
    completeHeat,
    undoHeat,
    clearScores,
    calculateRankings,
    deleteWorkout,
    updateSettings,
  }
}
