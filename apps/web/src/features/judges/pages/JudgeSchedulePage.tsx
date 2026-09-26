import {
  Badge,
  EmptyState,
  Input,
  Skeleton,
  Stack,
  Text,
  cx,
} from '@mond-design-system/react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useSettings } from '@/api/settings'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { JudgeGate } from '@/components/JudgeGate/JudgeGate'
import { OperatorShell } from '@/layouts/OperatorShell'
import { useJudgeSchedule } from '../api'
import { findViolations } from '../violations'
import styles from './JudgeSchedulePage.module.css'

// v1: src/components/JudgeScheduleView.tsx, served at /[slug]/judges. Who is
// standing at which lane, heat by heat, and where the plan works a judge for
// longer than the competition said it would.
//
// An operator screen: a tablet at the judges' table, one job, no navigation.
// v1 drew the heats as a three-column grid of cards, which reads across when
// the question is always "which heat next" — so heats now run down the page
// with their lanes under them.

const DEFAULT_MAX_CONSECUTIVE = 3

function fmtTime(ms: number | null): string {
  if (ms == null) return '—'
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function JudgeSchedule({ slug }: { slug: string }) {
  const { data, error } = useJudgeSchedule(slug)
  const settings = useSettings(slug)
  const maxConsecutive = settings.data?.judgeMaxConsecutive ?? DEFAULT_MAX_CONSECUTIVE
  const [filter, setFilter] = useState('')

  const search = filter.trim().toLowerCase()
  const filtered = search
    ? data?.workouts
        .map((wk) => ({
          ...wk,
          heats: wk.heats
            .map((h) => ({
              ...h,
              assignments: h.assignments.filter((a) => a.judgeName.toLowerCase().includes(search)),
            }))
            .filter((h) => h.assignments.length > 0),
        }))
        .filter((wk) => wk.heats.length > 0)
    : data?.workouts

  // Read from the whole schedule rather than the filtered one: a run of heats
  // is a fact about the judge's day, and a search that hides the middle heat
  // must not make the run look shorter than it is.
  const violations = useMemo(
    () => (data ? findViolations(data.workouts, maxConsecutive) : new Set<string>()),
    [data, maxConsecutive],
  )

  return (
    <OperatorShell
      title="Judges"
      back={`/${slug}`}
      backLabel="Back to competition"
      context={
        data && (
          <Text as="span" variant="meta" tone="muted">
            {data.judges.length} judge{data.judges.length !== 1 ? 's' : ''}
          </Text>
        )
      }
    >
      {data && data.judges.length > 0 && (
        <Input
          type="search"
          aria-label="Search judge"
          placeholder="Search judge…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onClear={() => setFilter('')}
          clearLabel="Clear search"
        />
      )}

      {error && (
        <EmptyState title="Could not load the judge schedule" description={error.message} />
      )}

      {!data && !error && (
        <div aria-busy="true">
          <Stack gap="base">
            <Skeleton lines={8} />
          </Stack>
        </div>
      )}

      {data && data.judges.length === 0 && (
        <EmptyState
          title="No judges yet"
          description="Give a volunteer the Judge role in the admin panel and they appear here."
        />
      )}

      {data && data.judges.length > 0 && (!filtered || filtered.length === 0) && (
        <EmptyState
          title={search ? 'Nobody by that name' : 'No assignments yet'}
          description={
            search
              ? 'No judge on the schedule answers to that.'
              : 'Lanes appear here once judges are assigned to heats.'
          }
        />
      )}

      {filtered?.map((wk) => (
        <DataPanel
          key={wk.id}
          title={`Workout ${wk.number}: ${wk.name}`}
          description={wk.locationName ?? undefined}
        >
          <Stack gap="group">
            {wk.heats.map((heat) => (
              <div key={heat.heatNumber} className={styles.heat}>
                <div className={styles.heatHead}>
                  <Text as="span" variant="label">Heat {heat.heatNumber}</Text>
                  {heat.walkoutTimeMs != null && (
                    <Text as="span" variant="meta" tone="muted">
                      Walk out {fmtTime(heat.walkoutTimeMs)}
                    </Text>
                  )}
                  {heat.heatTimeMs != null && (
                    <Text as="span" variant="meta" tone="muted">
                      Start {fmtTime(heat.heatTimeMs)}
                    </Text>
                  )}
                </div>
                <ul className={styles.lanes} aria-label={`Heat ${heat.heatNumber} judges`}>
                  {heat.assignments.map((a) => {
                    const over = violations.has(`${wk.id}-${a.judgeId}-${heat.heatNumber}`)
                    return (
                      <li key={a.lane} className={cx(styles.lane, over && styles.over)}>
                        <Text as="span" variant="label" className={styles.laneNumber}>
                          Lane {a.lane}
                        </Text>
                        <Text as="span">{a.judgeName}</Text>
                        {over && (
                          <Badge tone="danger">
                            Over {maxConsecutive} in a row
                          </Badge>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </Stack>
        </DataPanel>
      ))}
    </OperatorShell>
  )
}

export function JudgeSchedulePage() {
  const { slug = '' } = useParams()
  return (
    <JudgeGate title="Judge Access">
      <JudgeSchedule slug={slug} />
    </JudgeGate>
  )
}
