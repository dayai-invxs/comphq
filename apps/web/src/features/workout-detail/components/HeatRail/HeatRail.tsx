import { Badge, Text } from '@mond-design-system/react'
import styles from './HeatRail.module.css'

// A workout can run to a dozen heats, and v1 stacked every one of them full
// height down a single column: to answer "which heat is still unscored" you
// scrolled the whole workout and held the answer in your head.
//
// The heats get an index of their own, standing beside them where there is
// room and running along the top of the page where there is not. Each entry
// carries the three things the question is actually about — when the heat
// starts, how much of it is scored, and whether it is closed.
//
// Plain anchors, as the setup screen's section list uses: every heat is on
// this page, the browser already knows how to reach a fragment, and a link
// that survives being opened in a new tab is worth more than a scroll
// listener. It is navigation, not selection — the heats all stay mounted,
// which is what lets an athlete be dragged from one into another.

export interface HeatSummary {
  number: number
  /** Absent until the workout has a start time. */
  startLabel: string | null
  athletes: number
  scored: number
  complete: boolean
}

interface Props {
  items: HeatSummary[]
  className?: string
}

export function HeatRail({ items, className }: Props) {
  return (
    <nav aria-label="Heats" className={className}>
      <ul className={styles.list}>
        {items.map((heat) => (
          <li key={heat.number}>
            <a href={`#heat-${heat.number}`} className={styles.link}>
              {/* The spaces are what the accessible name is built out of — the
                  spans are flex items, so nothing whitespace-only is drawn. */}
              <Text as="span" variant="label">Heat {heat.number}</Text>{' '}
              <Text as="span" variant="meta" tone="muted">
                {heat.startLabel && `${heat.startLabel} · `}
                {heat.scored}/{heat.athletes} scored
              </Text>{' '}
              {heat.complete && <Badge tone="success">Done</Badge>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
