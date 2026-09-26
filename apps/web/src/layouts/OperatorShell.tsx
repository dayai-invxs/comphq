import { Button, Heading, Inline, Screen, ScreenContent, cx } from '@mond-design-system/react'
import { useLocation, useNavigate } from 'react-router'
import type { ReactNode } from 'react'
import { Glyph } from '@/components/Glyph/Glyph'
import { RouteBoundary } from './RouteBoundary'
import { MAIN_ID, SkipLink } from './SkipLink'
import styles from './OperatorShell.module.css'

// A tablet propped at a station running one job: a judge taking times, a
// corral marshal walking heats out, an equipment lead ticking a list. Chrome
// is noise here, so there is almost none — a context bar saying what is being
// worked on, the list filling the screen, and at most one action anchored
// within thumb reach.
//
// No navigation. The operator is not browsing; the way out is back, once.

export interface OperatorShellProps {
  /** What is being worked on. */
  title: ReactNode
  /** The heat, the clock, the live mark — whatever names the moment. */
  context?: ReactNode
  /** Where back goes. Omitted, there is no back. */
  back?: string
  backLabel?: string
  /** The single primary action, docked at the foot. */
  action?: ReactNode
  /** Let rows run edge to edge — they carry their own padding. */
  flush?: boolean
  children: ReactNode
}

export function OperatorShell({
  title,
  context,
  back,
  backLabel = 'Back',
  action,
  flush = false,
  children,
}: OperatorShellProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  return (
    <Screen>
      <SkipLink />

      <header className={styles.context}>
        <Inline gap="tight" align="center" justify="between" wrap>
          <Inline gap="tight" align="center" wrap>
            {back && (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={backLabel}
                onClick={() => navigate(back)}
              >
                <Glyph name="back" />
              </Button>
            )}
            <Heading level={1} variant="subtitle">{title}</Heading>
          </Inline>
          {context && <Inline gap="tight" align="center" wrap>{context}</Inline>}
        </Inline>
      </header>

      <ScreenContent id={MAIN_ID} flush={flush} className={cx(!flush && styles.padded)}>
        <RouteBoundary key={pathname}>{children}</RouteBoundary>
      </ScreenContent>

      {action && <div className={styles.dock}>{action}</div>}
    </Screen>
  )
}
