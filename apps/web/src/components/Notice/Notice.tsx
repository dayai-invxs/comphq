import { Button, Inline, Text, cx } from '@mond-design-system/react'
import type { ReactNode } from 'react'
import styles from './Notice.module.css'

// What a screen says went wrong, or went right.
//
// Five pages hand-rolled the same block — a sunken Card, a role, a coloured
// Text, and on three of them a "dismiss" ghost button — each with its own
// max-width rule in its own stylesheet. Five copies of one thing is five
// chances for the next one to be a little different, and they already were:
// one said "Error: " and the others did not, two could be dismissed and one
// could not.
//
// The role is derived rather than passed, because it is not a free choice: a
// failure interrupts and an outcome does not.

export interface NoticeProps {
  tone: 'danger' | 'success'
  /** Offered only where a message outlives what raised it. */
  onDismiss?: () => void
  /** Names the dismiss control for a reader who cannot see what it sits beside. */
  dismissLabel?: string
  className?: string
  children: ReactNode
}

export function Notice({ tone, onDismiss, dismissLabel = 'Dismiss', className, children }: NoticeProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(styles.notice, styles[tone], className)}
    >
      <Inline gap="base" align="center" justify="between" wrap>
        <Text tone={tone}>{children}</Text>
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss} aria-label={dismissLabel}>
            Dismiss
          </Button>
        )}
      </Inline>
    </div>
  )
}
