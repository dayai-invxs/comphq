import { cx } from '@mond-design-system/react'
import styles from './LiveBadge.module.css'

// The one amber now-signal in the app. Amber means live-now and nothing else,
// so it is worth having exactly one component able to draw it — a screen that
// wants to mark something as running reaches for this rather than reaching for
// the highlight token.
//
// The dot pulses, and the word is what a screen reader gets: an animation is
// not a status, and prefers-reduced-motion stops the pulse without stopping
// the meaning.

export interface LiveBadgeProps {
  /** What is live. Default "Live". */
  children?: string
  /** Dot alone, for a row too dense to carry the word. The word survives in
      the accessible name. */
  compact?: boolean
  className?: string
}

export function LiveBadge({ children = 'Live', compact = false, className }: LiveBadgeProps) {
  return (
    <span
      className={cx(styles.badge, compact && styles.compact, className)}
      role="status"
      aria-label={compact ? children : undefined}
    >
      <span className={styles.dot} aria-hidden="true" />
      {!compact && <span className={styles.word}>{children}</span>}
    </span>
  )
}
