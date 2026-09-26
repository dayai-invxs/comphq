import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  Stack,
  Text,
  cx,
} from '@mond-design-system/react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useSetEquipChecks } from '@/api/checks'
import { useChecks, useOps } from '@/api/liveReads'
import { queryKeys } from '@/api/queryKeys'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { JudgeGate } from '@/components/JudgeGate/JudgeGate'
import { Notice } from '@/components/Notice/Notice'
import { OperatorShell } from '@/layouts/OperatorShell'
import { useRealtimeInvalidation } from '@/lib/useRealtimeInvalidation'
import { useWorkoutEquipment, type EquipmentItem } from '../api'
import styles from './EquipmentPage.module.css'

// v1: src/components/EquipmentControlView.tsx + EquipmentControl.tsx, served at
// /[slug]/equipment. The list the floor crew works down: for each heat about to
// run, which division still needs its rig set, and what that rig is.
//
// An operator screen. v1 laid the heats out as a grid of cards up to three
// wide, so a crew working in heat order read across and then back; they run
// down the page now, in the order they will be set.

type HeatEntry = { athleteId: number; lane: number; divisionName: string | null }
type Heat = { heatNumber: number; isComplete: boolean; entries: HeatEntry[] }
type WorkoutData = { id: number; number: number; name: string; status: string; heats: Heat[] }
type OpsData = { workouts: WorkoutData[]; showBib: boolean }

const NO_DIVISION = '__none__'

// The key the check state is stored under, in v1's format: a division that
// never existed reads as `__none__` rather than as the empty string, which is
// also a division name a competition could type.
function checkKey(workoutId: number, heatNumber: number, divisionName: string | null) {
  return `${workoutId}-${heatNumber}-${divisionName ?? NO_DIVISION}`
}

function HeatRow({
  workout,
  heat,
  equipment,
  checks,
  onToggle,
}: {
  workout: WorkoutData
  heat: Heat
  equipment: EquipmentItem[]
  checks: Record<string, boolean>
  onToggle: (divisionName: string | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const entries = [...heat.entries].sort((a, b) => a.lane - b.lane)
  const divisionNames = [...new Set(entries.map((e) => e.divisionName))]
  const isChecked = (d: string | null) => checks[checkKey(workout.id, heat.heatNumber, d)] ?? false
  const allChecked = divisionNames.length > 0 && divisionNames.every(isChecked)
  const detail = `equip-${workout.id}-${heat.heatNumber}-detail`

  return (
    <div
      className={cx(styles.heat, allChecked && styles.done)}
      role="group"
      aria-label={`Heat ${heat.heatNumber}`}
    >
      <div className={styles.heatHead}>
        <Text as="span" variant="label">Heat {heat.heatNumber}</Text>
        {allChecked && <Badge tone="success">Set</Badge>}
        {heat.isComplete && <Badge tone="neutral">Run</Badge>}
        {entries.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls={detail}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide kit' : 'Show kit'}
          </Button>
        )}
      </div>

      {/* The row of ticks is what the crew works down, so it wraps rather than
          scrolls: a check that has scrolled off the side of a phone is a check
          nobody makes. */}
      <div className={styles.divisions}>
        {divisionNames.length === 0 && (
          <Text variant="meta" tone="muted">No athletes assigned</Text>
        )}
        {divisionNames.map((divisionName) => (
          <Checkbox
            key={divisionName ?? NO_DIVISION}
            label={divisionName ?? 'No Division'}
            checked={isChecked(divisionName)}
            onChange={() => onToggle(divisionName)}
          />
        ))}
      </div>

      {expanded && entries.length > 0 && (
        <div id={detail} className={styles.detail}>
          {divisionNames.map((divisionName) => {
            // An item with no division is everyone's, so it is listed under
            // each division rather than in a pile of its own.
            const items = equipment.filter(
              (e) => e.divisionId === null || e.division?.name === divisionName,
            )
            return (
              <div key={divisionName ?? NO_DIVISION}>
                <Text variant="meta" tone="muted">{divisionName ?? 'No Division'}</Text>
                {items.length === 0 ? (
                  <Text variant="meta" tone="muted">No equipment listed</Text>
                ) : (
                  <ul className={styles.items}>
                    {items.map((eq) => (
                      <li key={eq.id}>
                        <Text as="span" variant="meta">{eq.item}</Text>
                        {eq.divisionId === null && divisionNames.length > 1 && (
                          <Text as="span" variant="meta" tone="muted"> (all)</Text>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}

          <div>
            <Text variant="meta" tone="muted">Lane assignments</Text>
            <ul className={styles.items}>
              {entries.map((e) => (
                <li key={e.athleteId}>
                  <Text as="span" variant="meta" className={styles.laneNumber}>Lane {e.lane}</Text>{' '}
                  <Text as="span" variant="meta" tone="muted">{e.divisionName ?? 'No Division'}</Text>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function EquipmentControl({ slug }: { slug: string }) {
  const { data, error: opsError } = useOps<OpsData>(slug)
  const { data: checksData } = useChecks(slug)
  const equipChecks = checksData?.equipChecks ?? {}
  const workouts = data?.workouts ?? []
  const setEquipChecks = useSetEquipChecks(slug)
  const equipmentByWorkout = useWorkoutEquipment(slug, workouts.map((w) => w.id))
  const [resetting, setResetting] = useState(false)

  const realtimeKeys = useMemo(() => [queryKeys.ops(slug), queryKeys.checks(slug)], [slug])
  useRealtimeInvalidation(realtimeKeys)

  function toggle(workoutId: number, heatNumber: number, divisionName: string | null) {
    const key = checkKey(workoutId, heatNumber, divisionName)
    setEquipChecks.setEntry(key, (old) => !old)
  }

  // A workout whose heats have all run has nothing left to set up.
  const pending = workouts.filter(
    (w) => w.heats.length === 0 || w.heats.some((h) => !h.isComplete),
  )

  return (
    <OperatorShell
      title="Equipment"
      back={`/${slug}`}
      backLabel="Back to competition"
      context={
        <Button variant="secondary" size="sm" onClick={() => setResetting(true)}>Reset</Button>
      }
    >
      {/* The tick itself stays where the finger put it — that is deliberate —
          but a write the server refused must be said out loud, or the crew and
          the server quietly disagree until the next poll. */}
      {setEquipChecks.error && (
        <Notice tone="danger">
          Checks not saved: {setEquipChecks.error.message}. The ticks shown here may not have reached the server.
        </Notice>
      )}
      {/* A failed read is not an empty floor, and it must not leave the
          skeleton shimmering for ever either. */}
      {!data && opsError && (
        <EmptyState title="Could not load the heats" description={opsError.message} />
      )}

      {!data && !opsError && (
        <div aria-busy="true">
          <Stack gap="base">
            <Skeleton lines={8} />
          </Stack>
        </div>
      )}

      {data && pending.length === 0 && (
        <EmptyState
          title="Nothing left to set"
          description="Every heat with equipment has already run."
        />
      )}

      {pending.map((workout) => (
        <DataPanel key={workout.id} title={`Workout ${workout.number}: ${workout.name}`}>
          {workout.heats.length === 0 ? (
            <Text variant="meta" tone="muted">No heats assigned.</Text>
          ) : (
            <Stack gap="group">
              {workout.heats.map((heat) => (
                <HeatRow
                  key={heat.heatNumber}
                  workout={workout}
                  heat={heat}
                  equipment={equipmentByWorkout[workout.id] ?? []}
                  checks={equipChecks}
                  onToggle={(divisionName) => toggle(workout.id, heat.heatNumber, divisionName)}
                />
              ))}
            </Stack>
          )}
        </DataPanel>
      ))}

      {/* v1 asked with window.confirm, which the crew's tablet draws in the
          browser's own words and which assistive tech treats as a page-level
          interruption. The system already owns this question everywhere else
          in the app. */}
      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        onConfirm={() => setEquipChecks.setAsync({})}
        title="Reset all checks?"
        description="Every equipment check on every heat is cleared. This cannot be undone."
        confirmLabel="Reset checks"
        cancelLabel="Cancel"
        tone="danger"
      />
    </OperatorShell>
  )
}

export function EquipmentPage() {
  const { slug = '' } = useParams()
  return (
    <JudgeGate title="Equipment Control">
      <EquipmentControl slug={slug} />
    </JudgeGate>
  )
}
