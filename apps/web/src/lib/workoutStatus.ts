import type { BadgeTone } from '@mond-design-system/react'

// v1's workoutEnums.ts carries the status labels and, beside them, Tailwind
// class strings — the one place presentation leaked into otherwise-pure domain
// code. The labels are copied verbatim, typo included: `INactive` is what the
// draft badge has always read, and a screen that quietly corrects it is not a
// port. The classes stay behind, replaced by a tone the system understands.
//
// v1 drew completed in blue, which a one-accent brand has no counterpart for.
// `accent` is the tone left that reads as different-from-running without
// reading as an alarm.
const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'INactive', tone: 'neutral' },
  active: { label: 'Active', tone: 'success' },
  completed: { label: 'Completed', tone: 'accent' },
}

export function statusBadge(status: string): { label: string; tone: BadgeTone } {
  return STATUS[status] ?? { label: status, tone: 'neutral' }
}
