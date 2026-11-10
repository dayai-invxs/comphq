import { Card, CardBody, CardHeader, DataTable, Heading, Inline, Stack, Text } from '@mond-design-system/react'
import type { DataColumn } from '@mond-design-system/react'
import { formatScore, formatTiebreak } from '@/lib/scoreFormat'
import type { Score, Workout } from '../../useWorkoutDetail'

// v1: src/components/workout-detail/WorkoutLeaderboard.tsx. One workout's own
// standings, read only — no refs, no gestures — so this is MDS `DataTable`,
// unlike HeatCard's hand-built table.

/** v1 painted the podium: gold for a win, accent for a medal, plain otherwise. */
const placingTone = (points: number | null) =>
  points === 1 ? ('warning' as const) : points != null && points <= 3 ? ('accent' as const) : ('primary' as const)

/** The total is two placings added, so its podium starts lower: a win with a
    Part B second is 3, not 1. */
const totalTone = (total: number) =>
  total <= 2 ? ('warning' as const) : total <= 6 ? ('accent' as const) : ('primary' as const)

const totalPoints = (s: Score, partBEnabled: boolean) =>
  (s.points ?? 0) + (partBEnabled ? (s.partBPoints ?? 0) : 0)

/** The standings one division at a time, in running order, the way placings
    are given: a #1 in Rx and a #1 in Scaled are two different wins, and one
    list of both read as a tie. Athletes with no division come last. */
function byDivision(scores: Score[]) {
  const groups = new Map<number | null, { name: string | null; order: number; rows: Score[] }>()
  for (const s of scores) {
    const d = s.athlete.division
    const key = d?.id ?? null
    const group = groups.get(key) ?? { name: d?.name ?? null, order: d?.order ?? Infinity, rows: [] }
    group.rows.push(s)
    groups.set(key, group)
  }
  return [...groups.entries()]
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => a.order - b.order || (a.name ?? '').localeCompare(b.name ?? ''))
}

export function WorkoutLeaderboard({ workout }: { workout: Workout }) {
  const ranked = [...workout.scores]
    .filter((s) => s.points != null)
    .sort((a, b) => totalPoints(a, workout.partBEnabled) - totalPoints(b, workout.partBEnabled))
  const groups = byDivision(ranked)

  const tiebreak = (s: Score) =>
    s.tiebreakRawScore != null && (
      <Text as="span" variant="meta" tone="accent">
        TB {workout.tiebreakScoreType === 'time'
          ? formatTiebreak(s.tiebreakRawScore)
          : formatScore(s.tiebreakRawScore, workout.tiebreakScoreType)}
      </Text>
    )

  // A one-part workout has nothing to call Part A: its placing and its score
  // get a column each.
  const single: DataColumn<Score>[] = [
    {
      key: 'position',
      header: 'Position',
      cell: (s) => <Text as="span" variant="label" tone={placingTone(s.points)}>#{s.points}</Text>,
    },
    {
      key: 'score',
      header: 'Score',
      cell: (s) => (
        <Inline gap="hairline" align="baseline" wrap>
          <Text as="span" variant="meta" tone="muted">{formatScore(s.rawScore, workout.scoreType, s.capped)}</Text>
          {tiebreak(s)}
        </Inline>
      ),
    },
  ]

  const parts: DataColumn<Score>[] = [
    {
      key: 'partA',
      header: 'Part A',
      cell: (s) => (
        <Inline gap="hairline" align="baseline" wrap>
          <Text as="span" variant="label" tone={placingTone(s.points)}>#{s.points}</Text>
          <Text as="span" variant="meta" tone="muted">{formatScore(s.rawScore, workout.scoreType, s.capped)}</Text>
        </Inline>
      ),
    },
    {
      key: 'partB',
      header: 'Part B',
      cell: (s: Score) =>
        s.partBPoints == null ? (
          <Text as="span" tone="muted">—</Text>
        ) : (
          <Inline gap="hairline" align="baseline">
            <Text as="span" variant="label" tone={placingTone(s.partBPoints)}>#{s.partBPoints}</Text>
            {s.partBRawScore != null && (
              <Text as="span" variant="meta" tone="muted">
                {formatScore(s.partBRawScore, workout.partBScoreType, s.partBCapped)}
              </Text>
            )}
          </Inline>
        ),
    },
  ]

  const columns: DataColumn<Score>[] = [
    { key: 'athlete', header: 'Athlete/Team', cell: (s) => <Text as="span" variant="label">{s.athlete.name}</Text> },
    ...(workout.partBEnabled ? parts : single),
    {
      key: 'points',
      header: 'Points',
      cell: (s) => {
        const total = totalPoints(s, workout.partBEnabled)
        return <Text as="span" variant="label" tone={totalTone(total)}>{total}</Text>
      },
    },
  ]

  // A heading per division only where there is a division to name.
  const named = groups.some((g) => g.name != null)

  return (
    <Card>
      <CardHeader>
        <Heading level={2} variant="subtitle">Leaderboard — WOD {workout.number}</Heading>
      </CardHeader>
      <CardBody>
        <Stack gap="section">
          {(groups.length ? groups : [{ id: null, name: null, order: 0, rows: [] as Score[] }]).map((g) => {
            const title = g.name ?? 'No Division'
            return (
              <Stack key={String(g.id)} gap="tight">
                {named && <Heading level={3} variant="label">{title}</Heading>}
                <DataTable
                  label={named ? `Leaderboard for WOD ${workout.number}, ${title}` : `Leaderboard for WOD ${workout.number}`}
                  columns={columns}
                  rows={g.rows}
                  rowKey={(s) => String(s.id)}
                  rowLabel={(s) => s.athlete.name}
                />
              </Stack>
            )
          })}
        </Stack>
      </CardBody>
    </Card>
  )
}
