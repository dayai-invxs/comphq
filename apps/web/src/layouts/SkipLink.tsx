import styles from './SkipLink.module.css'

// The first thing in the tab order, and off screen until it has focus. Every
// shell puts the same navigation ahead of the content; without this a keyboard
// reader walks eleven nav rows before reaching the leaderboard, on every page.
export const MAIN_ID = 'main'

export function SkipLink() {
  return (
    <a className={styles.skip} href={`#${MAIN_ID}`}>
      Skip to content
    </a>
  )
}
