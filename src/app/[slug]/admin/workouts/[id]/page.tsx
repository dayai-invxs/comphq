'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useWorkoutDetail } from '@/hooks/useWorkoutDetail'
import type { ScorePayload } from '@/hooks/useWorkoutDetail'
import { useScoreInputs } from '@/hooks/useScoreInputs'
import WorkoutEditForm from '@/components/workout-detail/WorkoutEditForm'
import WorkoutEquipmentPopover from '@/components/workout-detail/WorkoutEquipmentPopover'
import HeatCard from '@/components/workout-detail/HeatCard'
import { HeatDndProvider } from '@/components/workout-detail/heat-dnd-context'
import WorkoutLeaderboard from '@/components/workout-detail/WorkoutLeaderboard'
import { scoreTypeLabel, statusStyle } from '@/lib/workoutEnums'
import { getJson } from '@/lib/http'

type WorkoutLocation = { id: number; name: string }

export default function WorkoutDetailPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>()
  const router = useRouter()
  const workoutsPath = `/${slug}/admin/workouts`
  const [editing, setEditing] = useState(false)
  const [heatsUnlocked, setHeatsUnlocked] = useState(false)
  const [locations, setLocations] = useState<WorkoutLocation[]>([])

  const detail = useWorkoutDetail(id, { slug, onNotFound: () => router.push(workoutsPath) })
  const inputs = useScoreInputs(detail.workout)

  useEffect(() => {
    getJson<WorkoutLocation[]>(`/api/workout-locations?slug=${slug}`).then(setLocations).catch(() => {})
  }, [slug])

  // Re-hydrate input fields every time the workout reloads.
  useEffect(() => {
    if (detail.workout) inputs.hydrate(detail.workout)
    // inputs.hydrate is stable (useCallback with []); depending on detail.workout identity is what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.workout])

  const { byHeat, heatNums, scoredCount, totalAthletes, someScored, completedHeatNums } = useMemo(() => {
    const w = detail.workout
    if (!w) {
      return { byHeat: {}, heatNums: [], scoredCount: 0, totalAthletes: 0, someScored: false, completedHeatNums: [] as number[] }
    }
    const grouped = w.assignments.reduce<Record<number, typeof w.assignments>>((acc, a) => {
      ;(acc[a.heatNumber] ??= []).push(a)
      return acc
    }, {})
    const nums = Object.keys(grouped).map(Number).sort((a, b) => a - b)
    const scored = w.scores.filter((s) => s.rawScore != null).length
    return {
      byHeat: grouped,
      heatNums: nums,
      scoredCount: scored,
      totalAthletes: w.assignments.length,
      someScored: scored > 0,
      completedHeatNums: w.completedHeats ?? [],
    }
  }, [detail.workout])

  if (!detail.workout) return <div className="text-gray-400">Loading...</div>
  const workout = detail.workout

  function payloadsFor(athleteIds: number[]): ScorePayload[] {
    return athleteIds.map((aId) => inputs.buildPayload(aId)).filter((p): p is ScorePayload => p !== null)
  }

  function heatAthleteIds(heatNum: number): number[] {
    return (byHeat[heatNum] ?? []).map((a) => a.athlete.id)
  }

  function allAthleteIds(): number[] {
    return workout.assignments.map((a) => a.athlete.id)
  }

  async function saveAllScores() {
    await detail.saveMany(payloadsFor(allAthleteIds()), 'All scores saved.')
  }

  async function saveHeat(heatNum: number) {
    await detail.saveMany(payloadsFor(heatAthleteIds(heatNum)), `Heat ${heatNum} scores saved.`)
  }

  async function completeHeat(heatNum: number) {
    await detail.completeHeat(heatNum, payloadsFor(heatAthleteIds(heatNum)))
  }

  async function calculate() {
    await detail.calculateRankings(payloadsFor(allAthleteIds()))
  }

  async function handleClearScores() {
    if (!confirm('Clear all scores for this workout? This will also reset the workout to active.')) return
    inputs.clear()
    await detail.clearScores()
  }

  async function handleDelete() {
    if (!confirm('Delete this workout?')) return
    await detail.deleteWorkout()
    router.push(workoutsPath)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">WOD {workout.number}: {workout.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusStyle(workout.status).className}`}>{workout.status}</span>
            <span className="text-gray-400 text-sm">
              {workout.lanes} lanes · {scoreTypeLabel(workout.scoreType)} · {workout.mixedHeats ? 'Mixed heats' : 'Separate heats'} · {Math.floor(workout.timeBetweenHeatsSecs / 60)}m {workout.timeBetweenHeatsSecs % 60 > 0 ? `${workout.timeBetweenHeatsSecs % 60}s ` : ''}between heats
            </span>
            {workout.startTime && <span className="text-gray-400 text-sm">Starts {new Date(workout.startTime).toLocaleString()}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEditing(true)} className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Edit Settings</button>
          <WorkoutEquipmentPopover workoutId={id} slug={slug} />
          {workout.status === 'draft' && <button onClick={() => detail.setStatus('active')} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Activate</button>}
          {workout.status === 'active' && <button onClick={() => detail.setStatus('draft')} className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Deactivate</button>}
          {workout.status === 'completed' && <button onClick={() => detail.setStatus('active')} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Reactivate</button>}
          <button onClick={handleDelete} className="bg-red-900 hover:bg-red-800 text-red-300 text-sm font-medium rounded-lg px-4 py-2 transition-colors">Delete</button>
        </div>
      </div>

      {editing && (
        <WorkoutEditForm
          workout={workout}
          loading={detail.loading}
          locations={locations}
          onSave={detail.updateSettings}
          onCancel={() => setEditing(false)}
        />
      )}

      {detail.error && <div className="bg-red-900/50 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">Error: {detail.error}</div>}
      {!detail.error && detail.msg && <div className="bg-green-900/50 border border-green-700 text-green-300 rounded-lg px-4 py-3 text-sm">{detail.msg}</div>}

      <div className="bg-gray-900 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Heat Assignments</h2>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => detail.generateAssignments(false)}
            disabled={detail.loading || (heatNums.length > 0 && !heatsUnlocked)}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            Generate (Random / Division Order)
          </button>
          <button
            onClick={() => detail.generateAssignments(true)}
            disabled={detail.loading || (heatNums.length > 0 && !heatsUnlocked)}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            Generate (By Cumulative Points)
          </button>
          {heatNums.length > 0 && !heatsUnlocked && (
            <button
              onClick={() => {
                if (confirm('Regenerating heats will replace all existing assignments. Athletes may be moved between heats. Continue?')) {
                  setHeatsUnlocked(true)
                }
              }}
              className="bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              Unlock to Regenerate
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">Best athletes are placed in the last heat. Existing assignments are replaced.</p>
      </div>

      {heatNums.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Heats & Scores</h2>
            <div className="flex gap-3">
              <button onClick={handleClearScores} disabled={detail.loading || workout.scores.length === 0} className="bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-300 text-sm font-medium rounded-lg px-4 py-2 transition-colors">Clear All Scores</button>
              <button onClick={saveAllScores} disabled={detail.loading} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Save All Scores</button>
              <button
                onClick={calculate}
                disabled={detail.loading || !someScored}
                title={!someScored ? 'Enter at least one score first' : scoredCount < totalAthletes ? `${totalAthletes - scoredCount} athlete(s) without scores will be unranked` : ''}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
              >
                Calculate Rankings & Complete
                {scoredCount < totalAthletes && someScored && <span className="ml-1.5 text-blue-200 text-xs">({scoredCount}/{totalAthletes})</span>}
              </button>
            </div>
          </div>

          <HeatDndProvider>
            {heatNums.map((heatNum) => (
              <HeatCard
                key={heatNum}
                workout={workout}
                heatNumber={heatNum}
                entries={byHeat[heatNum] ?? []}
                isComplete={completedHeatNums.includes(heatNum)}
                loading={detail.loading}
                scoreInputs={inputs}
                onSaveHeat={saveHeat}
                onCompleteHeat={completeHeat}
                onUndoHeat={detail.undoHeat}
                onReorder={detail.reorderAssignments}
                onSaveHeatTime={detail.saveHeatTime}
                isSaving={detail.savingHeats.has(heatNum)}
              />
            ))}
          </HeatDndProvider>
        </div>
      )}

      {workout.status === 'completed' && workout.scores.length > 0 && (
        <WorkoutLeaderboard workout={workout} />
      )}
    </div>
  )
}
