import { Inline, Stack, Text, cx } from '@mond-design-system/react'
import type { ReactNode } from 'react'
import { LiveBadge } from '@/components/LiveBadge/LiveBadge'
import { fmtHeatTime } from '@/lib/heatTime'
import type { PendingHeat } from '@/lib/nowHeat'
import styles from './NowStrip.module.css'

// What is happening right now, drawn once. In v1 every heat on the board was
// the same size and the same weight, so a spectator read the whole schedule to
// find the one row they came for. This is that row, given the amber the rest
// of the app is not allowed.
//
// The clocks read in the order the heat runs: called to the corral, walked
// out, started.

export interface NowStripProps {
  now: PendingHeat
  /** Lanes, or whatever the screen hangs under the clocks. */
  children?: ReactNode
  className?: string
}

export function NowStrip({ now, children, className }: NowStripProps) {
  const { workout, heat, startMs, corralMs, walkoutMs } = now

  return (
    <section
      className={cx(styles.strip, className)}
      aria-label={`Now: workout ${workout.number}, heat ${heat.heatNumber}`}
    >
      <Stack gap="tight">
        <Inline gap="tight" align="center" wrap>
          <LiveBadge>Now</LiveBadge>
          <Text as="span" variant="label">
            Workout {workout.number} · {workout.name}
          </Text>
          {workout.locationName && (
            <Text as="span" variant="meta" tone="muted">{workout.locationName}</Text>
          )}
        </Inline>

        <Inline gap="base" align="baseline" wrap>
          <span className={styles.heat}>Heat {heat.heatNumber}</span>
          {now.divisions.length > 0 && (
            <Text as="span" variant="meta" tone="muted">{now.divisions.join(' / ')}</Text>
          )}
        </Inline>

        {startMs != null && (
          <dl className={styles.clocks}>
            <div className={styles.clock}>
              <dt>Corral</dt>
              <dd>{fmtHeatTime(corralMs)}</dd>
            </div>
            <div className={styles.clock}>
              <dt>Walk out</dt>
              <dd>{fmtHeatTime(walkoutMs)}</dd>
            </div>
            <div className={cx(styles.clock, styles.start)}>
              <dt>Start</dt>
              <dd>{fmtHeatTime(startMs)}</dd>
            </div>
          </dl>
        )}

        {children}
      </Stack>
    </section>
  )
}
