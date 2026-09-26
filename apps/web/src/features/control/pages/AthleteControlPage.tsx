import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Heading,
  Inline,
  Input,
  ListGroup,
  ListItem,
  Popover,
  PopoverBody,
  Skeleton,
  Stack,
  Text,
  VisuallyHidden,
  type DataColumn,
} from '@mond-design-system/react'
import { useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useSetAthleteChecks } from '@/api/checks'
import { useChecks, useOps } from '@/api/liveReads'
import { queryKeys } from '@/api/queryKeys'
import { LiveStatus } from '@/components/LiveStatus/LiveStatus'
import { Notice } from '@/components/Notice/Notice'
import { OperatorShell } from '@/layouts/OperatorShell'
import { fmtHeatTime as fmtMs } from '@/lib/heatTime'
import { getCorralMs, getHeatMs, getWalkoutMs, type Heat, type OpsData, type WorkoutData } from '@/lib/opsHeats'
import { useRealtimeInvalidation } from '@/lib/useRealtimeInvalidation'
import { useSetHeatTime } from '../api'
import { findConflicts, heatKey } from '../conflicts'

// v1: src/components/AthleteControl.tsx, served at /[slug]/control. The desk's
// own screen — the one page on the public side that asks for a sign-in. It
// calls each heat to the corral, walks it out, and moves a start time when the
// floor runs late.
//
// An operator screen: a laptop or tablet on the desk running one job, so it
// keeps the clock in the bar above the table and carries no navigation.

type RowChecks = { corral: boolean; walkout: boolean }

const EMPTY: RowChecks = { corral: false, walkout: false }

// The lanes hang off the row rather than unfolding inside it: a table row has
// nowhere to put a sub-row, and the lanes are a detail to glance at, not a
// column to compare down.
function LanesButton({ heatNumber, lanes }: { heatNumber: number; lanes: Heat['entries'] }) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        ref={anchor}
        variant="ghost"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Lanes
      </Button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchor}
        label={`Heat ${heatNumber} lanes`}
      >
        <PopoverBody>
          <ListGroup>
            {lanes.map((e) => (
              <ListItem
                key={e.athleteId}
                leading={
                  <Text as="span" variant="meta" tone="accent">
                    <VisuallyHidden>Lane </VisuallyHidden>
                    {e.lane}
                  </Text>
                }
                title={<Text as="span" variant="meta">{e.athleteName}</Text>}
              />
            ))}
          </ListGroup>
        </PopoverBody>
      </Popover>
    </>
  )
}

export function AthleteControlPage() {
  const { slug = '' } = useParams()
  const { data, dataUpdatedAt, error: opsError } = useOps<OpsData>(slug)
  const workouts = useMemo(() => data?.workouts ?? [], [data])
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null

  const { data: checksData } = useChecks(slug)
  const checks = checksData?.athleteChecks ?? {}
  const setChecks = useSetAthleteChecks(slug)
  const setHeatTime = useSetHeatTime(slug)

  const [editingHeat, setEditingHeat] = useState<{ workoutId: number; heatNumber: number } | null>(null)
  const [heatTimeInput, setHeatTimeInput] = useState('')
  const [resetting, setResetting] = useState(false)

  // v1 subscribed to the heats and not to the checks. A tick made on another
  // phone therefore lands with the three-second poll instead of at once, which
  // is fast enough for a box and is kept.
  const realtimeKeys = useMemo(() => [queryKeys.ops(slug), queryKeys.checks(slug)], [slug])
  useRealtimeInvalidation(realtimeKeys)

  const conflicts = useMemo(() => findConflicts(workouts), [workouts])

  function getChecks(key: string): RowChecks {
    return checks[key] ?? EMPTY
  }

  function toggle(key: string, field: keyof RowChecks) {
    setChecks.setEntry(key, (old) => ({ ...EMPTY, ...old, [field]: !old?.[field] }))
  }

  function startEditHeatTime(workout: WorkoutData, heatNumber: number) {
    const ms = getHeatMs(workout, heatNumber)
    if (ms == null) return
    const d = new Date(ms)
    setHeatTimeInput(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    setEditingHeat({ workoutId: workout.id, heatNumber })
  }

  // The heat keeps its day and takes a new hour and minute: the desk is moving
  // a heat by twenty minutes, not to another date. Building it through the
  // local Date constructor is what makes the typed time mean the time on the
  // clock on the wall.
  function saveHeatTime() {
    if (!editingHeat || !heatTimeInput || setHeatTime.isPending) return
    const workout = workouts.find((w) => w.id === editingHeat.workoutId)
    if (!workout) return
    const ms = getHeatMs(workout, editingHeat.heatNumber)
    if (ms == null) return
    const base = new Date(ms)
    const [hh, mm] = heatTimeInput.split(':').map(Number)
    const isoTime = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mm, 0, 0).toISOString()
    setHeatTime.mutate(
      { workoutId: workout.id, heatNumber: editingHeat.heatNumber, isoTime },
      { onSuccess: () => setEditingHeat(null) },
    )
  }

  // A struck time is still worth reading — the strike is what says it has been
  // dealt with without taking it off the screen.
  function tickTime(ms: number | null, struck: boolean) {
    const time = fmtMs(ms)
    return struck ? <s>{time}</s> : time
  }

  // v1 drew the heats as a list because the hand-rolled table under it had
  // gone wrong, not because a table was wrong. DataTable owns the columns and
  // their alignment now; it pans on a phone rather than stacking, a trade
  // taken knowingly for a screen that mostly lives on the desk.
  function heatColumns(workout: WorkoutData): DataColumn<Heat>[] {
    return [
      {
        key: 'heat',
        header: 'Heat',
        cell: (heat) => {
          const key = heatKey(workout.id, heat.heatNumber)
          const lanes = [...heat.entries].sort((a, b) => a.lane - b.lane)
          return (
            <Inline gap="tight" wrap>
              <Text as="span" variant="label" tone="accent">Heat {heat.heatNumber}</Text>
              {heat.isComplete && (
                <Text as="span" variant="meta" tone="success">
                  <VisuallyHidden>Complete</VisuallyHidden>✓
                </Text>
              )}
              {/* v1 drew a red border around the row and nothing else, which
                  says nothing to a reader who cannot see it. The row still
                  takes the danger tint (COM-117); this says why. */}
              {conflicts.has(key) && <Badge tone="danger">Overlap</Badge>}
              {lanes.length > 0 && <LanesButton heatNumber={heat.heatNumber} lanes={lanes} />}
            </Inline>
          )
        },
      },
      {
        key: 'corral',
        header: 'Corral',
        cell: (heat) => {
          const key = heatKey(workout.id, heat.heatNumber)
          const ms = getHeatMs(workout, heat.heatNumber)
          const c = getChecks(key)
          return (
            <Inline gap="tight">
              <Checkbox
                label={`Corral heat ${heat.heatNumber}`}
                labelHidden
                checked={c.corral}
                onChange={() => toggle(key, 'corral')}
              />
              <Text as="span" variant="meta" tone="warning">
                {tickTime(getCorralMs(workout, ms), c.corral)}
              </Text>
            </Inline>
          )
        },
      },
      {
        key: 'walkout',
        header: 'Walk Out',
        cell: (heat) => {
          const key = heatKey(workout.id, heat.heatNumber)
          const ms = getHeatMs(workout, heat.heatNumber)
          const c = getChecks(key)
          return (
            <Inline gap="tight">
              <Checkbox
                label={`Walk Out heat ${heat.heatNumber}`}
                labelHidden
                checked={c.walkout}
                onChange={() => toggle(key, 'walkout')}
              />
              <Text as="span" variant="meta" tone="accent">
                {tickTime(getWalkoutMs(workout, ms), c.walkout)}
              </Text>
            </Inline>
          )
        },
      },
      {
        key: 'start',
        header: 'Start',
        cell: (heat) => {
          const ms = getHeatMs(workout, heat.heatNumber)
          const editing =
            editingHeat?.workoutId === workout.id && editingHeat?.heatNumber === heat.heatNumber
          return (
            <Inline gap="tight" wrap>
              {editing ? (
                <>
                  <Input
                    type="time"
                    size="sm"
                    aria-label={`Heat ${heat.heatNumber} start time`}
                    value={heatTimeInput}
                    onChange={(e) => setHeatTimeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveHeatTime()
                      if (e.key === 'Escape') setEditingHeat(null)
                    }}
                    autoFocus
                  />
                  <Button size="sm" disabled={setHeatTime.isPending} onClick={saveHeatTime}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingHeat(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <Text as="span" variant="meta">{fmtMs(ms)}</Text>
                  {ms != null && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit heat ${heat.heatNumber} start time`}
                      onClick={() => startEditHeatTime(workout, heat.heatNumber)}
                    >
                      Edit
                    </Button>
                  )}
                </>
              )}
            </Inline>
          )
        },
      },
    ]
  }

  return (
    <OperatorShell
      title="Control"
      back={`/${slug}`}
      backLabel="Back to competition"
      context={
        <>
          <LiveStatus updatedAt={lastUpdated} />
          <Button variant="secondary" size="sm" onClick={() => setResetting(true)}>Reset</Button>
        </>
      }
    >
      {/* The tick itself stays where the finger put it — that is deliberate —
          but a write the server refused must be said out loud, or the desk and
          the server quietly disagree until the next poll. */}
      {setChecks.error && (
        <Notice tone="danger">
          Checks not saved: {setChecks.error.message}. The ticks shown here may not have reached the server.
        </Notice>
      )}
      {setHeatTime.error && (
        <Notice tone="danger">
          Heat time not saved: {setHeatTime.error instanceof Error ? setHeatTime.error.message : String(setHeatTime.error)}
        </Notice>
      )}

      {/* A failed read is not an empty desk, and it must not leave the
          skeleton shimmering for ever either. */}
      {!data && opsError && (
        <EmptyState title="Could not load the heats" description={opsError.message} />
      )}

      {/* v1 asked the workout list rather than the query, so a competition
          with no workouts at all says it is loading for ever. */}
      {!data && !opsError && (
        <div aria-busy="true">
          <Stack gap="base">
            <Skeleton lines={8} />
          </Stack>
        </div>
      )}

      {data && workouts.length === 0 && (
        <EmptyState
          title="Nothing to run yet"
          description="Heats appear here once a workout has been built."
        />
      )}

      {/* Not a DataPanel around the table: DataTable draws its own card, and a
          panel around it would be the card-in-card the panel exists to end. */}
      {workouts.map((workout) => (
        <Stack
          key={workout.id}
          as="section"
          gap="tight"
          aria-label={`Workout ${workout.number}: ${workout.name}`}
        >
          <Heading level={2} variant="subtitle">
            Workout {workout.number}: {workout.name}
          </Heading>
          <DataTable
            label={`Workout ${workout.number} heats`}
            columns={heatColumns(workout)}
            rows={workout.heats}
            rowKey={(heat) => String(heat.heatNumber)}
            rowLabel={(heat) => `Heat ${heat.heatNumber}`}
            rowMuted={(heat) => {
              const c = getChecks(heatKey(workout.id, heat.heatNumber))
              return c.corral && c.walkout
            }}
            rowTone={(heat) => (conflicts.has(heatKey(workout.id, heat.heatNumber)) ? 'danger' : undefined)}
            empty="No heats assigned."
          />
        </Stack>
      ))}

      {/* v1 asked with window.confirm, which draws the browser's words rather
          than the app's and interrupts the page rather than the table. */}
      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        onConfirm={() => setChecks.setAsync({})}
        title="Reset all checks?"
        description="Every corral and walk-out tick on every heat is cleared. This cannot be undone."
        confirmLabel="Reset checks"
        cancelLabel="Cancel"
        tone="danger"
      />
    </OperatorShell>
  )
}
