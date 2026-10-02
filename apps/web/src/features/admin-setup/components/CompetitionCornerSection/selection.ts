import type { CcChange } from '@/api/competitionCorner'

// Which changes the admin keeps. Apply refuses a change whose `requires` were
// left out, so the boxes keep that rule as they are clicked rather than letting
// the admin find out on submit.

/** Every change except removals, which delete rows and are opt-in. */
export function defaultAccepted(changes: CcChange[]): Set<string> {
  return new Set(changes.filter((c) => c.kind !== 'remove').map((c) => c.key))
}

/** Checks `key` with everything it needs, or unchecks it with everything that needs it. */
export function toggle(accepted: Set<string>, changes: CcChange[], key: string, on: boolean): Set<string> {
  const next = new Set(accepted)
  const related = (k: string) => on
    ? changes.find((c) => c.key === k)?.requires ?? []
    : changes.filter((c) => c.requires.includes(k)).map((c) => c.key)
  const seen = new Set<string>()
  const queue = [key]
  while (queue.length) {
    const k = queue.pop()!
    if (seen.has(k)) continue
    seen.add(k)
    if (on) next.add(k)
    else next.delete(k)
    queue.push(...related(k))
  }
  return next
}
