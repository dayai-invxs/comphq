import {
  Button,
  DataTable,
  EmptyState,
  Input,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Text,
  cx,
  type DataColumn,
} from '@mond-design-system/react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useLeaderboard, type LeaderboardEntry } from '@/api/liveReads'
import { queryKeys } from '@/api/queryKeys'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { ScoreCell } from '@/components/ScoreCell/ScoreCell'
import { divisionsOf, formatTotal, hasAnyScore, rankRows, sameEverywhere } from '@/lib/standings'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useRealtimeInvalidation } from '@/lib/useRealtimeInvalidation'
import styles from './LeaderboardPage.module.css'

// v1: src/app/[slug]/leaderboard/page.tsx. The standings, lowest total winning.
// Ranking, tiebreaks and half-weighting are the API's — this screen reads what
// it is handed and never re-sorts by total.
//
// The one thing it does compute is the placing shown beside each athlete, and
// it is not the row number: athletes level in every workout share a placing and
// the ones after them are skipped, so two seconds are followed by a fourth.
//
// The division is a switch across the top rather than a dropdown among three
// others: it is the choice a reader makes on arriving, and every other control
// narrows what that choice already framed. The podium is weight and one mark,
// not three medal colours — v1 painted gold, silver and bronze fills, which
// made the top of the table the loudest thing on a screen whose subject is the
// numbers.

const ALL_DIVISIONS = '__all__'
const NULL_DIVISION = '__null__'

type Entry = LeaderboardEntry

export function LeaderboardPage() {
  const { slug = '' } = useParams()
  const { data, isPending, error } = useLeaderboard(slug)

  const [divisionFilter, setDivisionFilter] = useState<string>(ALL_DIVISIONS)
  const [workoutFilter, setWorkoutFilter] = useState<number | 'all'>('all')
  const [sortBy, setSortBy] = useState<'overall' | number>('overall')
  const [search, setSearch] = useState('')

  const realtimeKeys = useMemo(() => [queryKeys.leaderboard(slug)], [slug])
  useRealtimeInvalidation(realtimeKeys)

  const workouts = data?.workouts ?? []
  // Held steady across renders: the sort below memoizes on it, and a fresh []
  // every render is a fresh sort every render.
  const entries = useMemo(() => data?.entries ?? [], [data])
  const halfWeightIds = data?.halfWeightIds ?? []
  const tiebreakWorkoutId = data?.tiebreakWorkoutId ?? null

  // A table keeps its columns at every width and pans when they do not fit,
  // and what pans off the side of a phone first is the placing and the name —
  // the two cells every other cell is read against. So a phone reading all the
  // workouts is given the standing itself, and the workout switch above the
  // table is how it reads one workout's scores.
  const roomForWorkouts = useMediaQuery('(min-width: 600px)')

  const visibleWorkouts =
    workoutFilter === 'all'
      ? (roomForWorkouts ? workouts : [])
      : workouts.filter((w) => w.id === workoutFilter)

  const divisions = divisionsOf(entries)

  const searchTerm = search.trim().toLowerCase()

  const sortedEntries = useMemo(() => {
    if (sortBy === 'overall') return entries
    const wId = sortBy
    return [...entries].sort((a, b) => {
      const aScore = a.workoutScores[wId]
      const bScore = b.workoutScores[wId]
      if (aScore && bScore) return aScore.points - bScore.points
      if (aScore && !bScore) return -1
      if (!aScore && bScore) return 1
      return a.athleteName.localeCompare(b.athleteName)
    })
  }, [entries, sortBy])

  const workoutIds = workouts.map((w) => w.id)

  // Level on the total is not level: two athletes can reach the same total by
  // different routes, and only the ones who placed identically everywhere share
  // a rank. Reading one workout, that workout's placing is the whole test.
  function isTrulyTied(a: Entry, b: Entry): boolean {
    if (sortBy === 'overall') return sameEverywhere(a, b, workoutIds)
    return (a.workoutScores[sortBy]?.points ?? null) === (b.workoutScores[sortBy]?.points ?? null)
  }

  function hasRelevantScore(entry: Entry): boolean {
    return workoutFilter === 'all' ? hasAnyScore(entry) : entry.workoutScores[workoutFilter] != null
  }

  function totalCell(entry: Entry) {
    const tiebreak = tiebreakWorkoutId ? entry.workoutScores[tiebreakWorkoutId]?.display : null
    return (
      <>
        <Text as="span" variant="label">{hasAnyScore(entry) ? formatTotal(entry.totalPoints) : '—'}</Text>
        {tiebreak && <Text variant="meta" tone="muted">TB {tiebreak}</Text>}
      </>
    )
  }

  const columns: DataColumn<{ entry: Entry; rank: number | '—' }>[] = [
    {
      key: 'rank',
      header: 'Rank',
      width: '4rem',
      cell: (r) => (
        <Text
          as="span"
          variant="label"
          className={cx(styles.rank, typeof r.rank === 'number' && r.rank <= 3 && styles.podium)}
        >
          {r.rank}
        </Text>
      ),
    },
    { key: 'athlete', header: 'Athlete', cell: (r) => <Text as="span" variant="label">{r.entry.athleteName}</Text> },
    ...visibleWorkouts.map((w) => ({
      key: `workout-${w.id}`,
      header: (
        <>
          WOD {w.number}
          {halfWeightIds.includes(w.id) && <> <Text as="span" variant="meta" tone="warning">½</Text></>}
        </>
      ),
      cell: (r: { entry: Entry }) => <ScoreCell score={r.entry.workoutScores[w.id]} />,
    })),
    ...(workoutFilter === 'all'
      ? [{ key: 'total', header: 'Total Pts', cell: (r: { entry: Entry }) => totalCell(r.entry) }]
      : []),
  ]

  function rowsFor(divisionName: string | null) {
    let rows = sortedEntries.filter((e) => e.divisionName === divisionName)
    if (searchTerm) rows = rows.filter((e) => e.athleteName.toLowerCase().includes(searchTerm))
    return rows
  }

  function renderTable(divisionName: string | null) {
    const rows = rowsFor(divisionName)
    if (rows.length === 0) return null
    const name = divisionName ?? 'No Division'
    return (
      <DataPanel key={name} title={name} flush>
        <DataTable
          label={`${name} standings`}
          columns={columns}
          rows={rankRows(rows, hasRelevantScore, isTrulyTied)}
          rowKey={(r) => String(r.entry.athleteId)}
          rowLabel={(r) => r.entry.athleteName}
        />
      </DataPanel>
    )
  }

  const divisionsToRender = divisionFilter === ALL_DIVISIONS
    ? divisions
    : [divisionFilter === NULL_DIVISION ? null : divisionFilter]

  const hasFilters = divisionFilter !== ALL_DIVISIONS || workoutFilter !== 'all' || sortBy !== 'overall' || !!searchTerm

  function clearFilters() {
    setDivisionFilter(ALL_DIVISIONS)
    setWorkoutFilter('all')
    setSortBy('overall')
    setSearch('')
  }

  const nothingMatches =
    !isPending && workouts.length > 0 && divisionsToRender.every((d) => rowsFor(d).length === 0)

  return (
    <PageFrame
      title="Leaderboard"
      description={
        !isPending && workouts.length > 0
          ? `${workouts.length} workout${workouts.length !== 1 ? 's' : ''} · Lower points = better`
          : undefined
      }
      actions={
        hasFilters ? (
          <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button>
        ) : undefined
      }
      wide
    >
      {isPending && (
        <div aria-busy="true">
          <Stack gap="base">
            <Skeleton variant="rect" height="var(--mds-space-9)" />
            <Skeleton lines={6} />
          </Stack>
        </div>
      )}

      {/* A failed read is not an empty board: without this branch the refusal
          fell through to "No standings yet". */}
      {error && (
        <EmptyState title="Could not load the leaderboard" description={error.message} />
      )}

      {!isPending && !error && workouts.length === 0 && (
        <EmptyState
          title="No standings yet"
          description="The board fills in as workouts are scored."
        />
      )}

      {!isPending && workouts.length > 0 && (
        <Stack gap="base">
          {divisions.length > 1 && (
            <div className={styles.divisionScroll}>
              <SegmentedControl
                label="Division"
                value={divisionFilter}
                onChange={setDivisionFilter}
                options={[
                  { value: ALL_DIVISIONS, label: 'All' },
                  ...divisions.map((d) => ({ value: d ?? NULL_DIVISION, label: d ?? 'No Division' })),
                ]}
              />
            </div>
          )}

          <div className={styles.filters}>
            <Input
              type="search"
              aria-label="Search athlete"
              placeholder="Search athlete…"
              size="sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch('')}
              clearLabel="Clear search"
            />
            {/* Picking a workout sorts by it too: reading one column while the
                rows are ordered by another is how v1 avoided a table that says
                nothing about either. */}
            <Select
              aria-label="Workout"
              size="sm"
              value={workoutFilter}
              onChange={(e) => {
                const value = e.target.value === 'all' ? 'all' : Number(e.target.value)
                setWorkoutFilter(value)
                setSortBy(value === 'all' ? 'overall' : value)
              }}
            >
              <option value="all">All Workouts</option>
              {workouts.map((w) => (
                <option key={w.id} value={w.id}>WOD {w.number}: {w.name}</option>
              ))}
            </Select>
            <Select
              aria-label="Sort"
              size="sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value === 'overall' ? 'overall' : Number(e.target.value))}
            >
              <option value="overall">Sort: Overall</option>
              {workouts.map((w) => (
                <option key={w.id} value={w.id}>Sort: WOD {w.number}</option>
              ))}
            </Select>
          </div>

          {nothingMatches ? (
            <EmptyState
              title="No athletes match"
              description="Nothing in this division answers to that search."
              action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <Stack gap="section">{divisionsToRender.map((d) => renderTable(d))}</Stack>
          )}
        </Stack>
      )}
    </PageFrame>
  )
}
