import { Card, CardBody, CardHeader, DataTable, Heading, Inline, Text } from '@mond-design-system/react'
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

export function WorkoutLeaderboard({ workout }: { workout: Workout }) {
  const ranked = [...workout.scores]
    .filter((s) => s.points != null)
    .sort((a, b) => totalPoints(a, workout.partBEnabled) - totalPoints(b, workout.partBEnabled))

  const columns: DataColumn<Score>[] = [
    { key: 'athlete', header: 'Athlete', cell: (s) => <Text as="span" variant="label">{s.athlete.name}</Text> },
    {
      key: 'partA',
      header: 'Part A',
      cell: (s) => (
        <Inline gap="hairline" align="baseline" wrap>
          <Text as="span" variant="label" tone={placingTone(s.points)}>#{s.points}</Text>
          <Text as="span" variant="meta" tone="muted">{formatScore(s.rawScore, workout.scoreType)}</Text>
          {!workout.partBEnabled && s.tiebreakRawScore != null && (
            <Text as="span" variant="meta" tone="accent">
              TB {workout.tiebreakScoreType === 'time'
                ? formatTiebreak(s.tiebreakRawScore)
                : formatScore(s.tiebreakRawScore, workout.tiebreakScoreType)}
            </Text>
          )}
        </Inline>
      ),
    },
    ...(workout.partBEnabled
      ? [{
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
                    {formatScore(s.partBRawScore, workout.partBScoreType)}
                  </Text>
                )}
              </Inline>
            ),
        }]
      : []),
    {
      key: 'points',
      header: 'Points',
      cell: (s) => {
        const total = totalPoints(s, workout.partBEnabled)
        return <Text as="span" variant="label" tone={totalTone(total)}>{total}</Text>
      },
    },
  ]

  return (
    <Card>
      <CardHeader>
        <Heading level={2} variant="subtitle">Leaderboard — WOD {workout.number}</Heading>
      </CardHeader>
      <CardBody>
        <DataTable
          label={`Leaderboard for WOD ${workout.number}`}
          columns={columns}
          rows={ranked}
          rowKey={(s) => String(s.id)}
          rowLabel={(s) => s.athlete.name}
        />
      </CardBody>
    </Card>
  )
}
