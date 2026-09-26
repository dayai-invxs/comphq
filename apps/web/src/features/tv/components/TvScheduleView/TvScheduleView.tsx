import { Card, CardBody, CardHeader, EmptyState, ListGroup, ListItem, Skeleton, Text, cx } from '@mond-design-system/react'
import { LiveBadge } from '@/components/LiveBadge/LiveBadge'
import { fmtHeatTime } from '@/lib/heatTime'
import { pendingHeats, type AthleteChecks } from '@/lib/nowHeat'
import type { OpsData } from '@/lib/opsHeats'
import styles from './TvScheduleView.module.css'

// v1: ScheduleView in src/app/[slug]/TV/page.tsx. The next three heats across
// every active workout, ordered by the clock rather than by workout — a floor
// running two workouts at once has one queue, not two.
//
// The queue is `lib/nowHeat.ts`, which is the same answer the public schedule
// and the operator screens read. v1 sorted and filtered the payload here for
// the fourth time in the app, and this copy is what the port carried over.
//
// The first card is the heat on the floor, and it is the one thing on the
// board the palette lets carry amber. Everything else — names, lanes, clocks —
// is neutral, because a wall read from thirty feet has room for one signal.

const UPCOMING = 3

interface Props {
  data: OpsData | undefined
  error: Error | null
  checks: AthleteChecks
}

export function TvScheduleView({ data, error, checks }: Props) {
  if (error) {
    return (
      <div className={styles.notice}>
        <EmptyState title="Cannot reach the schedule" description={error.message} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.heats} aria-busy="true">
        {[0, 1, 2].map((i) => <Skeleton key={i} lines={6} />)}
      </div>
    )
  }

  const upcoming = pendingHeats(data, checks).slice(0, UPCOMING)

  if (upcoming.length === 0) {
    return (
      <div className={styles.notice}>
        <EmptyState
          title="Nothing on the floor"
          description="The board fills again when the next workout starts."
        />
      </div>
    )
  }

  return (
    <div className={styles.heats}>
      {upcoming.map(({ workout, heat, startMs, corralMs, walkoutMs, divisions }, i) => (
        <Card
          as="section"
          key={`${workout.id}-${heat.heatNumber}`}
          className={cx(styles.card, i === 0 && styles.now)}
          aria-label={`Heat ${heat.heatNumber}, workout ${workout.number}`}
        >
          <CardHeader>
            <Text variant="label" className={styles.workout}>
              Workout {workout.number}: {workout.name}
              {workout.locationName && <> · {workout.locationName}</>}
            </Text>
            <span className={styles.heatLine}>
              <span className={styles.heat}>Heat {heat.heatNumber}</span>
              {i === 0 && <LiveBadge>Now</LiveBadge>}
            </span>
            {divisions.length > 0 && (
              <Text tone="muted" className={styles.divisions}>{divisions.join(' / ')}</Text>
            )}
            {startMs != null && (
              <dl className={styles.times}>
                <div className={styles.time}>
                  <dt>Corral</dt>
                  <dd>{fmtHeatTime(corralMs)}</dd>
                </div>
                <div className={styles.time}>
                  <dt>Walk out</dt>
                  <dd>{fmtHeatTime(walkoutMs)}</dd>
                </div>
                <div className={cx(styles.time, styles.start)}>
                  <dt>Start</dt>
                  <dd>{fmtHeatTime(startMs)}</dd>
                </div>
              </dl>
            )}
          </CardHeader>
          <CardBody>
            <ListGroup aria-label={`Heat ${heat.heatNumber} lanes`}>
              {[...heat.entries]
                .sort((a, b) => a.lane - b.lane)
                .map((e) => (
                  <ListItem
                    key={e.athleteId}
                    className={styles.lane}
                    leading={<span className={styles.laneNumber}>L{e.lane}</span>}
                    title={<span className={styles.athlete}>{e.athleteName}</span>}
                    trailing={
                      e.divisionName
                        ? <Text as="span" tone="muted" className={styles.division}>{e.divisionName}</Text>
                        : undefined
                    }
                  />
                ))}
            </ListGroup>
          </CardBody>
        </Card>
      ))}
    </div>
  )
}
