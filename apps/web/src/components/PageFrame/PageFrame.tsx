import { Heading, Inline, Stack, cx } from '@mond-design-system/react'
import type { ReactNode } from 'react'
import styles from './PageFrame.module.css'

// One rhythm for all 24 screens. Every page in the port hand-rolled its own
// head block — a Heading, sometimes a description, sometimes a row of buttons,
// each with its own spacing — so no two screens started at the same place.
//
// The h1 lives here and only here. A screen supplies the words; where they sit
// and how far the content is from them is not a per-screen decision.
//
// The page gutter belongs to the shell's ScreenContent. This owns the reading
// measure and the rhythm inside it, so the two never double up.

export interface PageFrameProps {
  title: ReactNode
  /** One line under the title. */
  description?: ReactNode
  /** Small word above the title — the competition, the workout this belongs to. */
  eyebrow?: ReactNode
  /** Primary controls for the whole screen. */
  actions?: ReactNode
  /** The live signal, at the far end of the title row. */
  status?: ReactNode
  /** Let the content run to the full width — a wide table, a board. Default
      holds it to the reading measure. */
  wide?: boolean
  className?: string
  children: ReactNode
}

export function PageFrame({
  title,
  description,
  eyebrow,
  actions,
  status,
  wide = false,
  className,
  children,
}: PageFrameProps) {
  return (
    <div className={cx(styles.frame, wide && styles.wide, className)}>
      <div className={styles.head}>
        <Inline justify="between" align="start" gap="base" wrap>
          <Stack gap="hairline">
            {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
            <Inline gap="tight" align="center" wrap>
              <Heading level={1}>{title}</Heading>
              {status}
            </Inline>
            {description && <div className={styles.description}>{description}</div>}
          </Stack>
          {actions && <Inline gap="tight" wrap>{actions}</Inline>}
        </Inline>
      </div>
      <Stack gap="section">{children}</Stack>
    </div>
  )
}
