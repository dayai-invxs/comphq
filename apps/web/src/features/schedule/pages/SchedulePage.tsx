import { Button, EmptyState, Skeleton, Stack, Text, VisuallyHidden } from '@mond-design-system/react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useChecks, useOps } from '@/api/liveReads'
import { queryKeys } from '@/api/queryKeys'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { LiveStatus } from '@/components/LiveStatus/LiveStatus'
import { NowStrip } from '@/components/NowStrip/NowStrip'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { fmtHeatTime } from '@/lib/heatTime'
import type { OpsData } from '@/lib/opsHeats'
import { pendingHeats, type PendingHeat } from '@/lib/nowHeat'
import { useRealtimeInvalidation } from '@/lib/useRealtimeInvalidation'
import styles from './SchedulePage.module.css'

// v1: src/components/PublicSchedule.tsx, served at /[slug]. The board a
// spectator reads: what is running, which heat is next, and when it walks out.
//
// v1 drew every heat of every active workout as an equal card in a three
// column grid, so finding the one heat someone came for meant reading the
// whole board. Here the running heat is the screen and the rest is a list
// ordered by the clock — which is what a spectator navigates by — with each
// heat on one line until it is asked to open.

function Lanes({ now, showBib }: { now: PendingHeat; showBib: boolean }) {
  const lanes = [...now.heat.entries].sort((a, b) => a.lane - b.lane)
  return (
    <ul className={styles.lanes} aria-label={`Heat ${now.heat.heatNumber} lanes`}>
      {lanes.map((e) => (
        <li key={e.athleteId} className={styles.lane}>
          <Text as="span" variant="label" className={styles.laneNumber}>
            <VisuallyHidden>Lane </VisuallyHidden>{e.lane}
          </Text>
          <Text as="span">{e.athleteName}</Text>
          {showBib && <Text as="span" variant="meta" tone="muted">Bib {e.bibNumber ?? '—'}</Text>}
        </li>
      ))}
    </ul>
  )
}

function UpNextRow({ heat, showBib }: { heat: PendingHeat; showBib: boolean }) {
  const [open, setOpen] = useState(false)
  const id = `heat-${heat.workout.id}-${heat.heat.heatNumber}`

  return (
    <li className={styles.row}>
      <Button
        variant="ghost"
        fullWidth
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.rowLine}>
          <span className={styles.time}>{fmtHeatTime(heat.startMs)}</span>
          <span className={styles.what}>
            Workout {heat.workout.number} · Heat {heat.heat.heatNumber}
          </span>
          {heat.divisions.length > 0 && (
            <span className={styles.divisions}>{heat.divisions.join(' / ')}</span>
          )}
        </span>
      </Button>
      {open && (
        <div id={id} className={styles.rowDetail}>
          <Lanes now={heat} showBib={showBib} />
        </div>
      )}
    </li>
  )
}

export function SchedulePage() {
  const { slug = '' } = useParams()
  const { data, dataUpdatedAt, error } = useOps<OpsData>(slug)
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null
  const { data: checksData } = useChecks(slug)
  const athleteChecks = checksData?.athleteChecks ?? {}

  const realtimeKeys = useMemo(
    () => [queryKeys.ops(slug), queryKeys.leaderboard(slug), queryKeys.checks(slug)],
    [slug],
  )
  useRealtimeInvalidation(realtimeKeys)

  const showBib = data?.showBib ?? false
  const pending = pendingHeats(data, athleteChecks)
  const [now, ...upcoming] = pending

  return (
    <PageFrame title="Schedule" status={<LiveStatus updatedAt={lastUpdated} />}>
      {!data && !error && (
        <div aria-busy="true">
          <Stack gap="base">
            <Skeleton variant="rect" height="var(--mds-space-12)" />
            <Skeleton lines={4} />
          </Stack>
        </div>
      )}

      {/* A failed read is not an empty floor: without this branch the refusal
          left the skeleton up for ever. */}
      {!data && error && (
        <EmptyState title="Could not load the schedule" description={error.message} />
      )}

      {data && !now && (
        <EmptyState
          title="Nothing on the floor"
          description="No heat is waiting to run. The board fills as workouts go active."
        />
      )}

      {now && (
        <NowStrip now={now}>
          <Lanes now={now} showBib={showBib} />
        </NowStrip>
      )}

      {upcoming.length > 0 && (
        <DataPanel title="Up next" description={`${upcoming.length} heats to run`} flush>
          <ul className={styles.list}>
            {upcoming.map((heat) => (
              <UpNextRow
                key={`${heat.workout.id}-${heat.heat.heatNumber}`}
                heat={heat}
                showBib={showBib}
              />
            ))}
          </ul>
        </DataPanel>
      )}
    </PageFrame>
  )
}
