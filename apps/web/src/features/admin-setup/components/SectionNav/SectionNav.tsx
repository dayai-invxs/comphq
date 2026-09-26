import { cx } from '@mond-design-system/react'
import styles from './SectionNav.module.css'

// Setup is six regions on one address, which is v1's shape and stays: a
// division, a location and a role are all things you set up once, and splitting
// them across six screens would make the one job six navigations. What v1 did
// not have is a way to reach the sixth region without scrolling past the other
// five — 642 lines of it.
//
// So the regions get a list of their own, pinned beside them on a wide screen
// and along the top of the page on a narrow one. Plain anchors: the regions are
// on this page, the browser already knows how to reach a fragment, and a link
// that survives being opened in a new tab is worth more than a scroll listener.

export interface SectionLink {
  /** The id on the region this points at. */
  id: string
  label: string
}

interface Props {
  links: SectionLink[]
  className?: string
}

export function SectionNav({ links, className }: Props) {
  return (
    <nav aria-label="Setup sections" className={cx(styles.nav, className)}>
      <ul className={styles.list}>
        {links.map((link) => (
          <li key={link.id}>
            <a href={`#${link.id}`} className={styles.link}>{link.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
