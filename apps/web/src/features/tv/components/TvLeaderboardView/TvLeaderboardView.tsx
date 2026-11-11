import { Card, CardBody, CardHeader, EmptyState, Heading, Skeleton, Text, VisuallyHidden, cx } from '@mond-design-system/react'
import type { LeaderboardData, LeaderboardEntry } from '@/api/liveReads'
import { formatTotal } from '@/lib/standings'
import { MemberNames } from '@/components/MemberNames/MemberNames'
import { panelColumns, tvPanels } from '../../leaderboardLayouts'
import { splitColumns } from '../../splitColumns'
import styles from './TvLeaderboardView.module.css'

// v1: LeaderboardView in src/app/[slug]/TV/page.tsx. One panel per division,
// in the order the setup screen set, each showing the share of its division
// that screen asked for.
//
// The ranking is the API's: the rows are shown in the order they arrive and
// numbered by position. That is not the placing the public leaderboard prints
// — there, athletes level in every workout share a number — but a scoreboard
// counting 1, 2, 2, 4 across a gym is v1's, and it is what the room sees.

// v1 painted the first three places gold, silver and bronze, and clamped the
// index so it did not run out of colours — which painted everyone from third
// down bronze, and left the board unable to tell third place from eighth
// (defect 28). The clamp is not the bug; the ladder is. A wall read from
// thirty feet has room for one signal, this board spends it on the heat that
// is running, and a rank is a number the room can already read.
//
// So the places are numbered and nothing else. The leader is set apart by
// weight, and says so in words for a reader who cannot see the weight.
//
// A division too long to read at full size is split into two or three columns
// rather than the whole board shrunk (`layout`, see leaderboardLayouts.ts, picked by
// TvPage's useScaleToFit).

interface Props {
  data: LeaderboardData | undefined
  error?: Error | null
  /** Which arrangement to draw; see leaderboardLayouts.ts. */
  layout?: number
}

export function TvLeaderboardView({ data, error, layout = 0 }: Props) {
  // A failed read is not "No scores yet": that would tell a room
  // mid-competition that nobody has scored anything.
  if (error) {
    return (
      <div className={styles.notice}>
        <EmptyState title="Cannot reach the standings" description={error.message} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.panels} aria-busy="true">
        {[0, 1, 2].map((i) => <Skeleton key={i} lines={6} />)}
      </div>
    )
  }

  // Nobody scored yet is an empty board, not a ranking by name at 0 points.
  const panels = tvPanels(data)
  if (panels.every((p) => p.rows.length === 0)) {
    return (
      <div className={styles.notice}>
        <EmptyState
          title="No scores yet"
          description="Standings appear here as soon as the first heat is scored."
        />
      </div>
    )
  }

  const columns = panelColumns(panels, layout)

  return (
    <div className={styles.panels}>
      {panels.map(({ division, rows }, p) => {
        const name = division ?? 'No Division'
        const runs = rows.length ? splitColumns(rows, columns[p]) : []
        return (
          <Card
            as="section"
            key={division ?? 'none'}
            aria-label={name}
            className={styles.panel}
            data-columns={runs.length > 1 ? runs.length : undefined}
          >
            <CardHeader>
              <Heading level={2} className={styles.division}>{name}</Heading>
            </CardHeader>
            <CardBody>
              {rows.length === 0 && <Text tone="muted" className={styles.empty}>No scores yet</Text>}
              <div className={styles.columns}>
                {runs.map((run, r) => {
                  const first = runs.slice(0, r).reduce((n, prev) => n + prev.length, 0)
                  return (
                    <ol
                      key={first}
                      start={first + 1}
                      className={styles.rows}
                      aria-label={runs.length > 1
                        ? `${name} standings ${first + 1}–${first + run.length}`
                        : `${name} standings`}
                    >
                      {run.map((row, i) => <Row key={row.athleteId} row={row} place={first + i + 1} />)}
                    </ol>
                  )
                })}
              </div>
            </CardBody>
          </Card>
        )
      })}
    </div>
  )
}

/** One place: the number, the name with its team under it, and the points on
    the name's line at the right, so a row is as tall as its name and no more. */
function Row({ row, place }: { row: LeaderboardEntry; place: number }) {
  const leading = place === 1
  return (
    <li className={cx(styles.row, leading && styles.lead)}>
      <span className={styles.place}>#{place}</span>
      <span className={styles.athlete}>
        <span className={styles.name}>
          {row.athleteName}
          {leading && <VisuallyHidden>, leading</VisuallyHidden>}
        </span>
        <MemberNames members={row.members} className={styles.members} />
      </span>
      <Text as="span" tone="muted" className={styles.points}>{formatTotal(row.totalPoints)} pts</Text>
    </li>
  )
}
