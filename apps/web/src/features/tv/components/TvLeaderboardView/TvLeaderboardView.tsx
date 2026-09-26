import { Card, CardBody, CardHeader, EmptyState, Heading, Skeleton, Text, VisuallyHidden, cx } from '@mond-design-system/react'
import type { LeaderboardData } from '@/api/liveReads'
import { formatTotal, tvDivisionsOf } from '@/lib/standings'
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

interface Props {
  data: LeaderboardData | undefined
  error?: Error | null
}

export function TvLeaderboardView({ data, error }: Props) {
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

  const { entries, workouts, tvLeaderboardPercentages = {}, tvLeaderboardOrder = {} } = data
  if (workouts.length === 0 || entries.length === 0) {
    return (
      <div className={styles.notice}>
        <EmptyState
          title="No scores yet"
          description="Standings appear here as soon as the first heat is scored."
        />
      </div>
    )
  }

  return (
    <div className={styles.panels}>
      {tvDivisionsOf(entries, tvLeaderboardOrder).map((division) => {
        const rows = entries.filter((e) => e.divisionName === division)
        // A share that rounds to nobody still shows the leader: a panel with a
        // heading and no rows tells the room less than one name does.
        const percent = division != null ? tvLeaderboardPercentages[division] ?? 100 : 100
        const shown = rows.slice(0, Math.max(1, Math.ceil(rows.length * percent / 100)))

        return (
          <Card as="section" key={division ?? 'none'} className={styles.panel}>
            <CardHeader>
              <Heading level={2} className={styles.division}>{division ?? 'No Division'}</Heading>
            </CardHeader>
            <CardBody>
              <ol className={styles.rows} aria-label={`${division ?? 'No Division'} standings`}>
                {shown.map((row, i) => (
                  <li key={row.athleteId} className={cx(styles.row, i === 0 && styles.lead)}>
                    <span className={styles.place}>#{i + 1}</span>
                    <span className={styles.athlete}>
                      <span className={styles.name}>
                        {row.athleteName}
                        {i === 0 && <VisuallyHidden>, leading</VisuallyHidden>}
                      </span>
                      <Text as="span" tone="muted" className={styles.points}>{formatTotal(row.totalPoints)} pts</Text>
                    </span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        )
      })}
    </div>
  )
}
