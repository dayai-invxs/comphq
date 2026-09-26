import styles from './Glyph.module.css'

// The app's own icon set. MDS ships an Icon that renders from a registered
// glyph set through IconProvider; CompHQ registers none, and a scoreboard app
// needs eleven marks rather than a library. These are framework-free paths
// drawn on one 24-unit grid, stroked in currentcolor, so a glyph takes the
// colour of whatever nav row or tab it sits in.

const PATHS = {
  schedule: 'M4 7h16M4 12h16M4 17h10M4 7v10',
  leaderboard: 'M5 20V11M12 20V4M19 20v-6M3 20h18',
  athletes: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 21a7 7 0 0 1 14 0',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  dashboard: 'M4 13h7V4H4v9ZM13 20h7v-9h-7v9ZM4 20h7v-4H4v4ZM13 8h7V4h-7v4Z',
  workouts: 'M4 9v6M8 6v12M16 6v12M20 9v6M8 12h8',
  people: 'M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 21a7 7 0 0 1 14 0M17 3.5a3 3 0 0 1 0 5.8M18 14.3a5 5 0 0 1 4 6.7',
  judges: 'M9 12l2 2 4-5M5 4h14v11a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5V4Z',
  equipment: 'M4 12h16M7 8v8M17 8v8M4 10v4M20 10v4',
  control: 'M5 6h14M5 12h14M5 18h14M9 6v0M15 12v0M8 18v0',
  setup: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.5 1.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z',
  users: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
  back: 'M15 5l-7 7 7 7',
} as const

export type GlyphName = keyof typeof PATHS

export interface GlyphProps {
  name: GlyphName
  /** Accessible name. Left off, the glyph is decorative — which is the case
      whenever the label it sits beside already says the same word. */
  label?: string
}

export function Glyph({ name, label }: GlyphProps) {
  return (
    <svg
      className={styles.glyph}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentcolor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
