/** v1's parseMinSec, verbatim, lifted out of the workouts admin page so the
    create form and the edit form read the same four boxes the same way.
    parseInt swallows anything it cannot read, so no input throws. */
export function parseMinSec(val: string): number {
  const [m = '0', s = '0'] = val.split(':')
  return (parseInt(m) || 0) * 60 + (parseInt(s) || 0)
}

/** The way back. v1 never needed it — its form only created, from literal
    defaults — but an edit screen has to fill the boxes from stored seconds. */
export function formatMinSec(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}
