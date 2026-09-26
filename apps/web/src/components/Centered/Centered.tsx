import { cx } from '@mond-design-system/react'
import type { ElementType, ReactNode } from 'react'
import styles from './Centered.module.css'

// A screen that is one thing in the middle of the page: a sign-in card, a
// gate's answer, a spinner while a redirect decides where to go. Four copies
// of the same three declarations had appeared before this was extracted.
//
// `as` is here because the thing to centre is not always a wrapper — a gate
// centres the ScreenContent itself rather than adding a box inside it.
export function Centered({
  as: As = 'div',
  className,
  children,
}: {
  as?: ElementType
  className?: string
  children: ReactNode
}) {
  return <As className={cx(styles.centered, className)}>{children}</As>
}
