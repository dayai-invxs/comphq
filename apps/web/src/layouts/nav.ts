import type { GlyphName } from '@/components/Glyph/Glyph'

// One vocabulary for every shell's navigation. The four modes differ in where
// the rows are drawn — a bottom bar, a rail, a menu — not in what a row is.

export type Destination = {
  to: string
  label: string
  icon: GlyphName
}

export type NavGroup = {
  /** Heading over the run. What the person is doing, not which table it reads. */
  label: string
  items: Destination[]
}
