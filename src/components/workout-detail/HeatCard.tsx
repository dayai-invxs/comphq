'use client'

import { useEffect, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap, Draggable } from '@/lib/gsap-client'
import { calcHeatStartMs } from '@/lib/heatTime'
import { formatScore, formatTiebreak } from '@/lib/scoreFormat'
import type { Workout, Assignment } from '@/hooks/useWorkoutDetail'
import type { useScoreInputs } from '@/hooks/useScoreInputs'
import { PartAInputCell, PartBInputCell } from './ScoreInputCells'
import { useHeatDnd } from './heat-dnd-context'
import { resolveDestIndex } from '@/lib/heat-reorder'

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
  onReorder: (dragId: number, destHeat: number, destIndex: number) => void
  onSaveHeatTime: (heatNumber: number, isoTime: string) => Promise<void>
  isSaving: boolean
}

function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(pointer: coarse)')
    setIsTouch(mq.matches)
    const listener = (e: MediaQueryListEvent) => setIsTouch(e.matches)
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [])
  return isTouch
}

export default function HeatCard({
  workout, heatNumber, entries, isComplete, loading, scoreInputs,
  onSaveHeat, onCompleteHeat, onUndoHeat, onReorder, onSaveHeatTime, isSaving,
}: Props) {
  const [editingHeatTime, setEditingHeatTime] = useState(false)
  const [heatTimeInput, setHeatTimeInput] = useState('')

  const dnd = useHeatDnd()
  const isTouch = useIsTouch()
  const containerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map())
  const handleRefs = useRef<Map<number, HTMLElement>>(new Map())
  const emptyRef = useRef<HTMLDivElement>(null)

  const sorted = [...entries].sort((a, b) => a.lane - b.lane)

  // Register row DOM nodes with the DnD context so cross-heat drop resolution
  // can locate them. Re-registers whenever the sorted order changes.
  useEffect(() => {
    const disposers: Array<() => void> = []
    sorted.forEach((a, index) => {
      const el = rowRefs.current.get(a.id)
      if (!el) return
      disposers.push(dnd.registerRow({ assignmentId: a.id, heatNumber, index, el }))
    })
    if (sorted.length === 0 && emptyRef.current) {
      disposers.push(dnd.registerHeatEmpty(heatNumber, emptyRef.current))
    }
    return () => disposers.forEach((d) => d())
    // Reregister when entries change (order, count, or ids).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatNumber, dnd, sorted.map((a) => a.id).join(','), sorted.length])

  // Create a GSAP Draggable per row. Locked while heat is complete or saving.
  useGSAP(
    () => {
      if (isComplete || isSaving) return
      const instances: Draggable[] = []
      for (const a of sorted) {
        const rowEl = rowRefs.current.get(a.id)
        if (!rowEl) continue
        const handleEl = handleRefs.current.get(a.id) ?? rowEl
        const [drag] = Draggable.create(rowEl, {
          type: 'y',
          trigger: isTouch ? handleEl : rowEl,
          cursor: 'grab',
          activeCursor: 'grabbing',
          zIndexBoost: true,
          onPress() {
            gsap.set(rowEl, { boxShadow: '0 12px 24px rgba(0,0,0,0.45)', backgroundColor: 'rgba(31,41,55,0.9)' })
          },
          onDragEnd() {
            const pe = this.pointerEvent as PointerEvent | MouseEvent | TouchEvent
            const pt = 'changedTouches' in pe && pe.changedTouches.length > 0
              ? pe.changedTouches[0]
              : (pe as PointerEvent)
            const clientX = (pt as { clientX: number }).clientX
            const clientY = (pt as { clientY: number }).clientY
            const target = dnd.resolveDropTarget(clientX, clientY, a.id)
            gsap.set(rowEl, { y: 0, x: 0, boxShadow: 'none', backgroundColor: '' })
            if (!target) return
            const srcIndex = sorted.findIndex((x) => x.id === a.id)
            const destIndex = resolveDestIndex(target.heatNumber, target.index, heatNumber, srcIndex)
            onReorder(a.id, target.heatNumber, destIndex)
          },
          onRelease() {
            gsap.set(rowEl, { boxShadow: 'none', backgroundColor: '' })
          },
        })
        instances.push(drag)
      }
      return () => instances.forEach((d) => d.kill())
    },
    { scope: containerRef, dependencies: [isComplete, isSaving, isTouch, sorted.map((a) => a.id).join(',')] },
  )

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

  return (
    <div ref={containerRef} className={`rounded-xl ${isComplete ? 'opacity-60' : 'bg-gray-900'}`}>
      <div className={`rounded-t-xl px-5 py-3 flex items-center justify-between ${isComplete ? 'bg-gray-700' : 'bg-gray-800'}`}>
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
                type="time" value={heatTimeInput}
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
              {isTouch && <th className="w-10 md:hidden" />}
              <th className="text-left px-5 py-2 text-gray-400 font-medium w-16">Lane</th>
              <th className="text-left px-5 py-2 text-gray-400 font-medium w-16">Heat</th>
              <th className="text-left px-5 py-2 text-gray-400 font-medium">Athlete</th>
              <th className="text-left px-5 py-2 text-gray-400 font-medium">Division</th>
              <th className="text-left px-5 py-2 text-gray-400 font-medium w-32">{workout.partBEnabled ? 'Part A' : 'Score'}</th>
              {workout.partBEnabled && <th className="text-left px-5 py-2 text-gray-400 font-medium w-32">Part B</th>}
              <th className="text-left px-5 py-2 text-gray-400 font-medium w-16">Points</th>
            </tr>
          </thead>
          <tbody>
            {isSaving && (
              Array.from({ length: Math.max(1, sorted.length) }).map((_, i) => (
                <tr key={`skel-${i}`} className="border-t border-gray-800">
                  <td colSpan={isTouch ? 8 : 7} className="px-5 py-3">
                    <div className="skeleton-shimmer h-5 rounded" />
                  </td>
                </tr>
              ))
            )}
            {!isSaving && sorted.length === 0 && (
              <tr>
                <td colSpan={isTouch ? 8 : 7} className="p-0">
                  <div
                    ref={emptyRef}
                    className="border-2 border-dashed border-gray-700 text-gray-500 text-sm text-center py-6 mx-3 my-2 rounded-lg"
                  >
                    Drop athletes here
                  </div>
                </td>
              </tr>
            )}
            {!isSaving && sorted.map((a) => {
              const score = workout.scores.find((s) => s.athleteId === a.athlete.id)
              return (
                <tr
                  key={a.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(a.id, el)
                    else rowRefs.current.delete(a.id)
                  }}
                  data-assignment-id={a.id}
                  className={`border-t border-gray-800 ${!isComplete ? 'hover:bg-gray-800/30' : ''}`}
                >
                  {isTouch && (
                    <td className="px-2 py-3 md:hidden">
                      <span
                        ref={(el) => {
                          if (el) handleRefs.current.set(a.id, el)
                          else handleRefs.current.delete(a.id)
                        }}
                        aria-label="Drag to reorder"
                        className="inline-flex items-center justify-center w-8 h-8 rounded text-gray-500 touch-none select-none cursor-grab active:cursor-grabbing"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                          <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
                          <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
                          <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
                        </svg>
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <span className="font-bold text-orange-400 px-2">{a.lane}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-gray-400 px-2">{a.heatNumber}</span>
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
                      tiebreakScoreType={workout.tiebreakScoreType}
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
                        {score.tiebreakRawScore != null && <div className="text-xs text-blue-400">TB {workout.tiebreakScoreType === 'time' ? formatTiebreak(score.tiebreakRawScore) : formatScore(score.tiebreakRawScore, workout.tiebreakScoreType)}</div>}
                      </div>
                    ) : '—'}
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
