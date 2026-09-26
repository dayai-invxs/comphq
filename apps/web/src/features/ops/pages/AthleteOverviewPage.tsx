import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Inline,
  Input,
  ListGroup,
  ListItem,
  Skeleton,
  Stack,
  Text,
  type DataColumn,
} from '@mond-design-system/react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useOps } from '@/api/liveReads'
import { queryKeys } from '@/api/queryKeys'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { LiveStatus } from '@/components/LiveStatus/LiveStatus'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { fmtHeatTime } from '@/lib/heatTime'
import { getHeatMs, type Heat, type HeatEntry, type OpsData, type WorkoutData } from '@/lib/opsHeats'
import { useRealtimeInvalidation } from '@/lib/useRealtimeInvalidation'
import { statusBadge } from '@/lib/workoutStatus'
import { athletesIn, matchAthletes, type Athlete } from '../athleteTimeline'
import styles from './AthleteOverviewPage.module.css'

// v1: src/components/OpsView.tsx, served at /[slug]/athlete-overview. v1 drew
// the whole competition workout-first — every workout, every heat, every lane,
// as equal cards — with a search that filtered the lanes inside that shape. So
// the question the screen exists to answer, "where is Alice and when does she
// run", was answered by scanning.
//
// Here the search is the screen: it resolves to athletes, and an athlete
// resolves to their own day. The floor is still readable in full below it,
// which is what the desk uses when nobody has asked about anyone in particular.

function Timeline({ athlete }: { athlete: Athlete }) {
  return (
    <ol className={styles.timeline}>
      {athlete.stops.map((stop) => (
        <li key={`${stop.workoutId}-${stop.heatNumber}`} className={styles.stop}>
          <span className={styles.stopTime}>{fmtHeatTime(stop.startMs)}</span>
          <Stack gap="hairline">
            <Text as="span" variant="label">
              Workout {stop.workoutNumber} · {stop.workoutName}
            </Text>
            <Inline gap="tight" align="center" wrap>
              <Text as="span" variant="meta" tone="muted">
                Heat {stop.heatNumber} · Lane {stop.lane}
              </Text>
              {stop.locationName && (
                <Text as="span" variant="meta" tone="muted">{stop.locationName}</Text>
              )}
            </Inline>
            {stop.corralMs != null && stop.walkoutMs != null && (
              <Text as="span" variant="meta" tone="muted">
                Corral {fmtHeatTime(stop.corralMs)} · Walk out {fmtHeatTime(stop.walkoutMs)}
              </Text>
            )}
            {/* A score is only the truth once the heat is over: until then it
                is whatever the judge has typed so far. */}
            {stop.isComplete && (
              <Inline gap="tight" align="center" wrap>
                {stop.scoreDisplay && (
                  <Text as="span" variant="meta">{stop.scoreDisplay}</Text>
                )}
                {stop.tiebreakDisplay && (
                  <Text as="span" variant="meta" tone="muted">TB {stop.tiebreakDisplay}</Text>
                )}
                <Badge tone="success">Done</Badge>
              </Inline>
            )}
          </Stack>
        </li>
      ))}
    </ol>
  )
}

export function AthleteOverviewPage() {
  const { slug = '' } = useParams()
  const { data, dataUpdatedAt, error } = useOps<OpsData>(slug)
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const realtimeKeys = useMemo(
    () => [queryKeys.ops(slug), queryKeys.schedule(slug), queryKeys.leaderboard(slug)],
    [slug],
  )
  useRealtimeInvalidation(realtimeKeys)

  const athletes = useMemo(() => athletesIn(data), [data])
  const matches = matchAthletes(athletes, search)
  // One match is an answer, not a shortlist.
  const selected =
    athletes.find((a) => a.athleteId === selectedId) ?? (matches.length === 1 ? matches[0] : undefined)

  function clear() {
    setSearch('')
    setSelectedId(null)
  }

  const laneColumns = (heat: Heat): DataColumn<HeatEntry>[] => [
    {
      key: 'lane',
      header: 'Lane',
      width: '3rem',
      cell: (e) => <Text as="span" variant="label" className={styles.lane}>{e.lane}</Text>,
    },
    {
      key: 'athlete',
      header: 'Athlete',
      cell: (e) => (
        <>
          <Text as="span" variant="label">{e.athleteName}</Text>
          {heat.isComplete && e.scoreDisplay && (
            <Text as="span" variant="meta" tone="muted"> {e.scoreDisplay}</Text>
          )}
          {heat.isComplete && e.tiebreakDisplay && (
            <Text as="span" variant="meta" tone="muted"> TB {e.tiebreakDisplay}</Text>
          )}
        </>
      ),
    },
    ...(data?.showBib
      ? [
          {
            key: 'bib',
            header: 'Bib',
            cell: (e: HeatEntry) => (
              <Text as="span" variant="meta" tone="muted">{e.bibNumber ?? '—'}</Text>
            ),
          },
        ]
      : []),
  ]

  function heatBlock(workout: WorkoutData, heat: Heat) {
    const startMs = getHeatMs(workout, heat.heatNumber)
    const divisions = [...new Set(heat.entries.map((e) => e.divisionName).filter(Boolean))]
    return (
      <div key={heat.heatNumber} className={styles.heat}>
        <Inline gap="tight" align="baseline" wrap>
          <Text as="span" variant="label">Heat {heat.heatNumber}</Text>
          <Text as="span" variant="meta" tone="muted">{fmtHeatTime(startMs)}</Text>
          {divisions.length > 0 && (
            <Text as="span" variant="meta" tone="muted">{divisions.join(' / ')}</Text>
          )}
          {heat.isComplete && <Badge tone="success">Done</Badge>}
        </Inline>
        <DataTable
          label={`Heat ${heat.heatNumber} lanes`}
          columns={laneColumns(heat)}
          rows={[...heat.entries].sort((a, b) => a.lane - b.lane)}
          rowKey={(e) => String(e.athleteId)}
          rowLabel={(e) => e.athleteName}
        />
      </div>
    )
  }

  return (
    <PageFrame
      title="Athletes"
      description="Find an athlete, or read the whole floor"
      status={<LiveStatus updatedAt={lastUpdated} />}
      wide
    >
      <Input
        type="search"
        aria-label="Search athlete"
        placeholder="Search by name or bib…"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setSelectedId(null) }}
        onClear={clear}
        clearLabel="Clear search"
      />

      {/* A failed read is not an empty floor, and it must not leave the
          skeleton shimmering for ever either. */}
      {!data && error && (
        <EmptyState title="Could not load the heats" description={error.message} />
      )}

      {!data && !error && (
        <div aria-busy="true">
          <Stack gap="base">
            <Skeleton lines={6} />
          </Stack>
        </div>
      )}

      {selected && (
        <DataPanel
          title={selected.athleteName}
          description={[selected.divisionName, selected.bibNumber && `Bib ${selected.bibNumber}`]
            .filter(Boolean)
            .join(' · ')}
          actions={<Button variant="secondary" size="sm" onClick={clear}>Clear</Button>}
        >
          {selected.stops.length === 0 ? (
            <Text tone="muted">Not in any heat yet.</Text>
          ) : (
            <Timeline athlete={selected} />
          )}
        </DataPanel>
      )}

      {!selected && search && (
        <DataPanel title={`${matches.length} match${matches.length === 1 ? '' : 'es'}`} flush>
          {matches.length === 0 ? (
            <EmptyState
              title="Nobody by that name"
              description="Check the spelling, or search the bib number instead."
              action={<Button variant="secondary" onClick={clear}>Show the floor</Button>}
            />
          ) : (
            <ListGroup aria-label="Search results">
              {matches.map((a) => (
                <ListItem
                  key={a.athleteId}
                  title={a.athleteName}
                  description={[a.divisionName, a.bibNumber && `Bib ${a.bibNumber}`]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    <Text as="span" variant="meta" tone="muted">
                      {a.stops.length} heat{a.stops.length === 1 ? '' : 's'}
                    </Text>
                  }
                  onClick={() => setSelectedId(a.athleteId)}
                />
              ))}
            </ListGroup>
          )}
        </DataPanel>
      )}

      {!selected && !search && data?.workouts.length === 0 && (
        <EmptyState
          title="No workouts yet"
          description="Heats appear here once a workout has been built."
        />
      )}

      {!selected && !search && data?.workouts.map((workout) => {
        const badge = statusBadge(workout.status)
        return (
          <DataPanel
            key={workout.id}
            title={`Workout ${workout.number}: ${workout.name}`}
            description={workout.locationName ?? undefined}
            actions={<Badge tone={badge.tone}>{badge.label}</Badge>}
          >
            {workout.heats.length === 0 ? (
              <Text variant="meta" tone="muted">No heats assigned.</Text>
            ) : (
              <Stack gap="group">{workout.heats.map((heat) => heatBlock(workout, heat))}</Stack>
            )}
          </DataPanel>
        )
      })}
    </PageFrame>
  )
}
