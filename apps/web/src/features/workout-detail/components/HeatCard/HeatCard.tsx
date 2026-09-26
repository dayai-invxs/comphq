import { useGSAP } from '@gsap/react'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Inline,
  Input,
  Select,
  Skeleton,
  Text,
  VisuallyHidden,
} from '@mond-design-system/react'
import { useEffect, useRef, useState } from 'react'
import { Draggable, gsap } from '@/lib/gsap-client'
import { resolveDestIndex } from '@/lib/heat-reorder'
import { calcHeatStartMs, fmtHeatTime } from '@/lib/heatTime'
import { getCorralMs, getWalkoutMs } from '@/lib/opsHeats'
import { formatScore, formatTiebreak } from '@/lib/scoreFormat'
import { useMediaQuery } from '@/lib/useMediaQuery'
import type { useScoreInputs } from '../../useScoreInputs'
import type { Assignment, Workout } from '../../useWorkoutDetail'
import { useHeatDnd } from '../heat-dnd-context'
import { PartAInputCell, PartBInputCell } from '../ScoreInputCells/ScoreInputCells'
import styles from './HeatCard.module.css'

// v1: src/components/workout-detail/HeatCard.tsx. The registry and the
// Draggable setup are v1's, line for line, because the lane a drop lands in is
// domain maths (`resolveDestIndex`) reached through raw pointer coordinates.
//
// The markup is a plain table rather than MDS `DataTable`: the DnD registry and
// `Draggable.create` both need the row's own `<tr>` element, and `DataTable`
// exposes only a container ref and reflows its rows into cards on narrow
// screens — the element the gesture layer measures would stop existing.

type ScoreInputs = ReturnType<typeof useScoreInputs>

type JudgeInfo = { volunteerId: number; assignmentId: number; judgeName: string }

interface Props {
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
  judges?: { id: number; name: string }[]
  judgesByLane?: Map<number, JudgeInfo>
  onJudgeChange?: (heatNumber: number, lane: number, volunteerId: number | null) => void
  onPointsOverride?: (athleteId: number, points: number) => Promise<void>
}

function DragHandle({ ref }: { ref: (el: HTMLElement | null) => void }) {
  return (
    <span ref={ref} aria-label="Drag to reorder" className={styles.handle}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
        <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
        <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
      </svg>
    </span>
  )
}

export function HeatCard({
  workout, heatNumber, entries, isComplete, loading, scoreInputs,
  onSaveHeat, onCompleteHeat, onUndoHeat, onReorder, onSaveHeatTime, isSaving,
  judges, judgesByLane, onJudgeChange, onPointsOverride,
}: Props) {
  const showJudges = judges != null && judges.length > 0
  const [editingHeatTime, setEditingHeatTime] = useState(false)
  const [heatTimeInput, setHeatTimeInput] = useState('')
  const [savingHeatTime, setSavingHeatTime] = useState(false)
  const [confirmPoints, setConfirmPoints] = useState<number | null>(null)
  const [editPoints, setEditPoints] = useState<{ athleteId: number; value: string } | null>(null)
  const [savingPoints, setSavingPoints] = useState(false)
  const pointsInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editPoints) pointsInputRef.current?.focus()
  }, [editPoints])

  const dnd = useHeatDnd()
  // A coarse pointer gets a drag handle; a mouse drags the row itself.
  const isTouch = useMediaQuery('(pointer: coarse)')
  const containerRef = useRef<HTMLElement>(null)
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
            rowEl.classList.add(styles.dragging)
          },
          onDragEnd() {
            const pe = this.pointerEvent as PointerEvent | MouseEvent | TouchEvent
            const pt = 'changedTouches' in pe && pe.changedTouches.length > 0
              ? pe.changedTouches[0]
              : (pe as PointerEvent)
            const clientX = (pt as { clientX: number }).clientX
            const clientY = (pt as { clientY: number }).clientY
            const target = dnd.resolveDropTarget(clientX, clientY, a.id)
            gsap.set(rowEl, { y: 0, x: 0 })
            rowEl.classList.remove(styles.dragging)
            if (!target) return
            const srcIndex = sorted.findIndex((x) => x.id === a.id)
            const destIndex = resolveDestIndex(target.heatNumber, target.index, heatNumber, srcIndex)
            onReorder(a.id, target.heatNumber, destIndex)
          },
          onRelease() {
            rowEl.classList.remove(styles.dragging)
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
  const startLabel = heatMs != null ? fmtHeatTime(heatMs) : null

  function openHeatTimeEdit() {
    if (heatMs == null) return
    const d = new Date(heatMs)
    setHeatTimeInput(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    setEditingHeatTime(true)
  }

  async function savePointsOverride() {
    if (!editPoints || savingPoints || !onPointsOverride) return
    const pts = parseInt(editPoints.value, 10)
    if (isNaN(pts) || pts < 1) return
    setSavingPoints(true)
    await onPointsOverride(editPoints.athleteId, pts)
    setEditPoints(null)
    setSavingPoints(false)
  }

  async function commitHeatTime() {
    if (!workout.startTime || !heatTimeInput || savingHeatTime) return
    const baseDate = heatMs != null ? new Date(heatMs) : new Date(workout.startTime)
    const [hh, mm] = heatTimeInput.split(':').map(Number)
    const newDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hh, mm, 0, 0)
    setSavingHeatTime(true)
    try {
      await onSaveHeatTime(heatNumber, newDate.toISOString())
      setEditingHeatTime(false)
    } finally {
      setSavingHeatTime(false)
    }
  }

  const columnCount =
    (isTouch ? 6 : 5) + (showJudges ? 1 : 0) + (workout.partBEnabled ? 1 : 0) + 1

  return (
    <Card
      ref={containerRef}
      variant={isComplete ? 'sunken' : 'card'}
      className={isComplete ? styles.done : undefined}
    >
      <CardHeader>
      <Inline gap="base" align="center" wrap>
        <Text as="span" variant="label" tone={isComplete ? 'muted' : 'accent'}>Heat {heatNumber}</Text>

        {isComplete ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={() => onUndoHeat(heatNumber)}
            title="Click to un-complete"
          >
            Completed
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="sm" disabled={loading} onClick={() => onSaveHeat(heatNumber)}>
              Save Heat
            </Button>
            <Button variant="primary" size="sm" disabled={loading} onClick={() => onCompleteHeat(heatNumber)}>
              Complete Heat
            </Button>
          </>
        )}

        {editingHeatTime ? (
          <Inline gap="tight" align="center">
            <Input
              type="time"
              size="sm"
              aria-label="Heat start time"
              value={heatTimeInput}
              onChange={(e) => setHeatTimeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitHeatTime()
                if (e.key === 'Escape') setEditingHeatTime(false)
              }}
              autoFocus
              className={styles.timeBox}
            />
            <Button variant="ghost" size="sm" disabled={savingHeatTime} onClick={() => void commitHeatTime()}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditingHeatTime(false)}>Cancel</Button>
          </Inline>
        ) : (
          startLabel && (
            <Inline gap="tight" align="center">
              <Text as="span" variant="meta" tone="muted">
                {startLabel}
                {heatMs != null && (
                  <>
                    {' · '}Corral: {fmtHeatTime(getCorralMs(workout, heatMs))}
                    {' · '}Walk Out: {fmtHeatTime(getWalkoutMs(workout, heatMs))}
                  </>
                )}
              </Text>
              <Button variant="ghost" size="sm" onClick={openHeatTimeEdit}>Edit time</Button>
            </Inline>
          )
        )}
      </Inline>
      </CardHeader>

      <CardBody className={styles.scroller}>
        <table className={styles.table} aria-busy={isSaving || undefined}>
          <thead>
            <tr>
              {isTouch && <th className={styles.handleCell}><VisuallyHidden>Reorder</VisuallyHidden></th>}
              <th scope="col" className={styles.narrow}>Lane</th>
              <th scope="col" className={styles.narrow}>Heat</th>
              <th scope="col">Athlete</th>
              <th scope="col">Division</th>
              {showJudges && <th scope="col">Judge</th>}
              <th scope="col">{workout.partBEnabled ? 'Part A' : 'Score'}</th>
              {workout.partBEnabled && <th scope="col">Part B</th>}
              <th scope="col" className={styles.narrow}>Points</th>
            </tr>
          </thead>
          <tbody>
            {isSaving &&
              Array.from({ length: Math.max(1, sorted.length) }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  <td colSpan={columnCount}><Skeleton /></td>
                </tr>
              ))}

            {!isSaving && sorted.length === 0 && (
              <tr>
                <td colSpan={columnCount} className={styles.dropCell}>
                  <div ref={emptyRef} className={styles.dropZone}>Drop athletes here</div>
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
                  className={isComplete ? undefined : styles.row}
                >
                  {isTouch && (
                    <td className={styles.handleCell}>
                      <DragHandle
                        ref={(el) => {
                          if (el) handleRefs.current.set(a.id, el)
                          else handleRefs.current.delete(a.id)
                        }}
                      />
                    </td>
                  )}
                  <td><Text as="span" variant="label" tone="accent">{a.lane}</Text></td>
                  <td><Text as="span" variant="meta" tone="muted">{a.heatNumber}</Text></td>
                  <td><Text as="span" variant="label">{a.athlete.name}</Text></td>
                  <td><Text as="span" variant="meta" tone="muted">{a.athlete.division?.name ?? '—'}</Text></td>
                  {showJudges && (
                    <td>
                      <Select
                        size="sm"
                        aria-label={`Judge for lane ${a.lane}`}
                        value={judgesByLane?.get(a.lane)?.volunteerId ?? ''}
                        onChange={(e) =>
                          onJudgeChange?.(heatNumber, a.lane, e.target.value ? Number(e.target.value) : null)
                        }
                      >
                        <option value="">— no judge —</option>
                        {judges!.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                      </Select>
                    </td>
                  )}
                  <td>
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
                    <td>
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
                  <td>
                    {!score ? '—' : editPoints?.athleteId === a.athlete.id ? (
                      <Inline gap="hairline" align="center">
                        <Text as="span" variant="meta" tone="muted">#</Text>
                        <Input
                          ref={pointsInputRef}
                          type="number"
                          size="sm"
                          min={1}
                          aria-label="Points"
                          value={editPoints.value}
                          onChange={(e) => setEditPoints((prev) => (prev ? { ...prev, value: e.target.value } : null))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void savePointsOverride()
                            if (e.key === 'Escape') setEditPoints(null)
                          }}
                          className={styles.pointsBox}
                        />
                        <Button variant="ghost" size="sm" disabled={savingPoints} onClick={() => void savePointsOverride()}>
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" aria-label="Cancel" onClick={() => setEditPoints(null)}>✕</Button>
                      </Inline>
                    ) : confirmPoints === a.athlete.id ? (
                      <Inline gap="tight" align="center" wrap>
                        <Text as="span" variant="meta" tone="warning">Change points?</Text>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setConfirmPoints(null)
                            setEditPoints({ athleteId: a.athlete.id, value: String(score.points ?? '') })
                          }}
                        >
                          Yes
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmPoints(null)}>No</Button>
                      </Inline>
                    ) : (
                      <>
                        <Text as="div" variant="label" tone={placingTone(score.points)}>
                          {score.points != null ? (
                            <button
                              type="button"
                              className={styles.placing}
                              title={onPointsOverride ? 'Click to edit points' : undefined}
                              onClick={() => onPointsOverride && setConfirmPoints(a.athlete.id)}
                            >
                              {`#${score.points}`}
                            </button>
                          ) : '—'}
                          {workout.partBEnabled && score.partBPoints != null && (
                            <Text as="span" variant="meta" tone="muted"> / B#{score.partBPoints}</Text>
                          )}
                        </Text>
                        {score.rawScore > 0 && (
                          <Text as="div" variant="meta" tone="muted">{formatScore(score.rawScore, workout.scoreType)}</Text>
                        )}
                        {score.tiebreakRawScore != null && (
                          <Text as="div" variant="meta" tone="accent">
                            TB {workout.tiebreakScoreType === 'time'
                              ? formatTiebreak(score.tiebreakRawScore)
                              : formatScore(score.tiebreakRawScore, workout.tiebreakScoreType)}
                          </Text>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardBody>
    </Card>
  )
}

/** v1 painted the podium: gold for a win, accent for a medal, plain otherwise. */
function placingTone(points: number | null) {
  if (points === 1) return 'warning' as const
  if (points != null && points <= 3) return 'accent' as const
  return 'primary' as const
}
