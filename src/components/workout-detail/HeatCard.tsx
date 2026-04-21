'use client'

import { useState } from 'react'
import { calcHeatStartMs } from '@/lib/heatTime'
import { formatScore, formatTiebreak } from '@/lib/scoreFormat'
import type { Workout, Assignment } from '@/hooks/useWorkoutDetail'
import type { useScoreInputs } from '@/hooks/useScoreInputs'
import { PartAInputCell, PartBInputCell } from './ScoreInputCells'

type ScoreInputs = ReturnType<typeof useScoreInputs>

type Props = {
  workout: Workout
  heatNumber: number
  entries: Assignment[]
  isComplete: boolean
  loading: boolean
  scoreInputs: ScoreInputs
  onSaveHeat: (heatNumber: number) => void
  onCompleteHeat: (heatNumber: number) => void
  onUndoHeat: (heatNumber: number) => void
  onSaveAssignment: (id: number, heatNumber: number, lane: number) => Promise<void>
  onSwapAssignments: (aId: number, bId: number) => Promise<void>
  onSaveHeatTime: (heatNumber: number, isoTime: string) => Promise<void>
}

export default function HeatCard({
  workout, heatNumber, entries, isComplete, loading, scoreInputs,
  onSaveHeat, onCompleteHeat, onUndoHeat, onSaveAssignment, onSwapAssignments, onSaveHeatTime,
}: Props) {
  const [editingHeatTime, setEditingHeatTime] = useState(false)
  const [heatTimeInput, setHeatTimeInput] = useState('')
  const [editingAssignment, setEditingAssignment] = useState<number | null>(null)
  const [assignEditHeat, setAssignEditHeat] = useState('')
  const [assignEditLane, setAssignEditLane] = useState('')
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  const sorted = [...entries].sort((a, b) => a.lane - b.lane)

  const heatMs = workout.startTime
    ? calcHeatStartMs(heatNumber, workout.startTime, workout.heatIntervalSecs, workout.heatStartOverrides, workout.timeBetweenHeatsSecs)
    : null
  const startLabel = heatMs != null
    ? new Date(heatMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  function openHeatTimeEdit() {
    if (heatMs == null) return
    const d = new Date(heatMs)
    setHeatTimeInput(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    setEditingHeatTime(true)
  }

  async function commitHeatTime() {
    if (!workout.startTime || !heatTimeInput) return
    const baseDate = heatMs != null ? new Date(heatMs) : new Date(workout.startTime)
    const [hh, mm] = heatTimeInput.split(':').map(Number)
    const newDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hh, mm, 0, 0)
    await onSaveHeatTime(heatNumber, newDate.toISOString())
    setEditingHeatTime(false)
  }

  function startEditAssignment(a: Assignment) {
    setEditingAssignment(a.id)
    setAssignEditHeat(String(a.heatNumber))
    setAssignEditLane(String(a.lane))
  }

  async function commitAssignment(id: number) {
    await onSaveAssignment(id, Number(assignEditHeat), Number(assignEditLane))
    setEditingAssignment(null)
  }

  return (
    <div className={`rounded-xl overflow-hidden ${isComplete ? 'opacity-60' : 'bg-gray-900'}`}>
      <div className={`px-5 py-3 flex items-center justify-between ${isComplete ? 'bg-gray-700' : 'bg-gray-800'}`}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`font-semibold ${isComplete ? 'text-gray-400' : 'text-orange-400'}`}>Heat {heatNumber}</span>
          {isComplete && (
            <button onClick={() => onUndoHeat(heatNumber)} disabled={loading} className="text-xs bg-green-900 hover:bg-red-900 text-green-400 hover:text-red-400 px-2 py-0.5 rounded-full font-medium transition-colors" title="Click to un-complete">
              Completed
            </button>
          )}
          {!isComplete && (
            <>
              <button onClick={() => onSaveHeat(heatNumber)} disabled={loading} className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium rounded px-2.5 py-1 transition-colors">Save Heat</button>
              <button onClick={() => onCompleteHeat(heatNumber)} disabled={loading} className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-medium rounded px-2.5 py-1 transition-colors">Complete Heat</button>
            </>
          )}
          {editingHeatTime ? (
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={heatTimeInput}
                onChange={(e) => setHeatTimeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void commitHeatTime(); if (e.key === 'Escape') setEditingHeatTime(false) }}
                autoFocus
                className="bg-gray-700 text-white rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button onClick={commitHeatTime} className="text-xs text-green-400 hover:text-green-300 font-medium">Save</button>
              <button onClick={() => setEditingHeatTime(false)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
            </div>
          ) : (
            startLabel && (
              <span className="text-gray-400 text-sm flex items-center gap-2">
                {startLabel}
                {heatMs != null && (
                  <>
                    {' · '}Corral: {new Date(heatMs - workout.callTimeSecs * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' · '}Walk Out: {new Date(heatMs - workout.walkoutTimeSecs * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </>
                )}
                {workout.startTime && <button onClick={openHeatTimeEdit} className="text-xs text-blue-400 hover:text-blue-300 transition-colors ml-1">Edit time</button>}
              </span>
            )
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left px-5 py-2 text-gray-400 font-medium w-16">Lane</th>
              <th className="text-left px-5 py-2 text-gray-400 font-medium w-16">Heat</th>
              <th className="text-left px-5 py-2 text-gray-400 font-medium">Athlete</th>
              <th className="text-left px-5 py-2 text-gray-400 font-medium">Division</th>
              <th className="text-left px-5 py-2 text-gray-400 font-medium w-32">{workout.partBEnabled ? 'Part A' : 'Score'}</th>
              {workout.partBEnabled && <th className="text-left px-5 py-2 text-gray-400 font-medium w-32">Part B</th>}
              <th className="text-left px-5 py-2 text-gray-400 font-medium w-16">Points</th>
              <th className="px-5 py-2 w-20" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const score = workout.scores.find((s) => s.athleteId === a.athlete.id)
              const isEditingThis = editingAssignment === a.id
              return (
                <tr
                  key={a.id}
                  draggable={!isEditingThis}
                  onDragStart={() => setDraggedId(a.id)}
                  onDragEnd={() => { setDraggedId(null); setDragOverId(null) }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverId(a.id) }}
                  onDragLeave={() => setDragOverId(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (draggedId != null) void onSwapAssignments(draggedId, a.id)
                    setDraggedId(null); setDragOverId(null)
                  }}
                  className={`border-t border-gray-800 cursor-grab active:cursor-grabbing transition-opacity ${isEditingThis ? 'bg-gray-800/40 cursor-default' : ''} ${draggedId === a.id ? 'opacity-40' : ''} ${dragOverId === a.id && draggedId !== a.id ? 'bg-orange-500/10 border-orange-500/50' : ''}`}
                >
                  <td className="px-3 py-2">
                    {isEditingThis
                      ? <input type="number" min="1" value={assignEditLane} onChange={(e) => setAssignEditLane(e.target.value)} className="w-14 bg-gray-700 text-white rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      : <span className="font-bold text-orange-400 px-2">{a.lane}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isEditingThis
                      ? <input type="number" min="1" value={assignEditHeat} onChange={(e) => setAssignEditHeat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void commitAssignment(a.id); if (e.key === 'Escape') setEditingAssignment(null) }} className="w-14 bg-gray-700 text-white rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      : <span className="text-gray-400 px-2">{a.heatNumber}</span>}
                  </td>
                  <td className="px-5 py-3 text-white font-medium">{a.athlete.name}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{a.athlete.division?.name ?? '—'}</td>
                  <td className="px-3 py-2">
                    <PartAInputCell
                      athleteId={a.athlete.id}
                      scoreType={workout.scoreType}
                      time={scoreInputs.timeInputs}
                      setTime={scoreInputs.setTimeInputs}
                      rr={scoreInputs.rrInputs}
                      setRr={scoreInputs.setRrInputs}
                      weight={scoreInputs.weightInputs}
                      setWeight={scoreInputs.setWeightInputs}
                      tiebreakEnabled={workout.tiebreakEnabled}
                      tiebreak={scoreInputs.tiebreakInputs}
                      setTiebreak={scoreInputs.setTiebreakInputs}
                    />
                  </td>
                  {workout.partBEnabled && (
                    <td className="px-3 py-2">
                      <PartBInputCell
                        athleteId={a.athlete.id}
                        scoreType={workout.partBScoreType}
                        time={scoreInputs.partBTimeInputs}
                        setTime={scoreInputs.setPartBTimeInputs}
                        rr={scoreInputs.partBRrInputs}
                        setRr={scoreInputs.setPartBRrInputs}
                        weight={scoreInputs.partBWeightInputs}
                        setWeight={scoreInputs.setPartBWeightInputs}
                      />
                    </td>
                  )}
                  <td className="px-5 py-3 text-gray-300">
                    {score ? (
                      <div>
                        <div className={`font-bold text-sm ${score.points === 1 ? 'text-yellow-400' : score.points !== null && score.points <= 3 ? 'text-orange-400' : 'text-white'}`}>
                          {score.points != null ? `#${score.points}` : '—'}
                          {workout.partBEnabled && score.partBPoints != null && (
                            <span className="text-gray-500 font-normal text-xs ml-1">/ B#{score.partBPoints}</span>
                          )}
                        </div>
                        {score.rawScore > 0 && <div className="text-xs text-gray-500">{formatScore(score.rawScore, workout.scoreType)}</div>}
                        {score.tiebreakRawScore != null && <div className="text-xs text-blue-400">TB {formatTiebreak(score.tiebreakRawScore)}</div>}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEditingThis ? (
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => commitAssignment(a.id)} className="text-xs text-green-400 hover:text-green-300 font-medium">Save</button>
                        <button onClick={() => setEditingAssignment(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => startEditAssignment(a)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
