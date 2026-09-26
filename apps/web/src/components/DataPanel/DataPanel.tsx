import { Heading, Inline, Stack, cx } from '@mond-design-system/react'
import type { ReactNode } from 'react'
import styles from './DataPanel.module.css'

// The one elevation a screen is allowed. `Card` is a surface with no opinion
// about nesting, and the port used it 117 times — cards inside cards inside a
// card — which is why the app read as a wall of grey boxes. A panel is a
// titled region of a page: it draws one border, it never contains another
// panel, and the rows inside it carry no surface of their own.
//
// It is not a Card wrapper. Card's padding lives on CardHeader/CardBody, so
// composing it here would put a second box inside the first for nothing.

export interface DataPanelProps {
  /** Region heading. Also names the region to a screen reader. */
  title?: ReactNode
  /** One line under the title — a count, a caveat. */
  description?: ReactNode
  /** Controls belonging to this region, on the title's line. */
  actions?: ReactNode
  /** Drop the inner gutter for a table or a list whose rows pad themselves. */
  flush?: boolean
  /** Recede the panel — a secondary region beside a primary one. */
  tone?: 'default' | 'sunken'
  className?: string
  children: ReactNode
}

export function DataPanel({
  title,
  description,
  actions,
  flush = false,
  tone = 'default',
  className,
  children,
}: DataPanelProps) {
  const head = title || description || actions

  return (
    <section
      className={cx(styles.panel, tone === 'sunken' && styles.sunken, className)}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      {head && (
        <div className={styles.head}>
          <Inline justify="between" align="start" gap="base">
            <Stack gap="hairline">
              {title && <Heading level={2} variant="subtitle">{title}</Heading>}
              {description && <div className={styles.description}>{description}</div>}
            </Stack>
            {actions && <Inline gap="tight" wrap>{actions}</Inline>}
          </Inline>
        </div>
      )}
      <div className={cx(styles.body, flush && styles.flush)}>{children}</div>
    </section>
  )
}
