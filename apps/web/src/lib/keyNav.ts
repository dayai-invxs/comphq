'use client'

/**
 * Arrow-key navigation across a set of inputs annotated with the same
 * `data-keynav-group` value. Attach onKeyDown={keyNav(group)} to each
 * input; Enter/ArrowDown go to the next input, ArrowUp to the previous.
 *
 * Works by querying the DOM for elements in tab order at keypress time,
 * which keeps it robust to React re-renders that shuffle element IDs.
 */
export function keyNav(group: string) {
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

    // Don't interfere with IME composition or the form submit on Enter if
    // the input happens to live inside a submit handler — but in our case
    // score inputs are not inside a <form>, so Enter steals focus cleanly.
    const nodes = Array.from(
      document.querySelectorAll<HTMLInputElement>(`[data-keynav-group="${group}"]`),
    ).filter((n) => !n.disabled)
    const idx = nodes.indexOf(e.currentTarget)
    if (idx < 0) return

    const delta = e.key === 'ArrowUp' ? -1 : 1
    const next = nodes[idx + delta]
    if (next) {
      e.preventDefault()
      next.focus({ preventScroll: true })
      next.select()
      reveal(next)
    }
  }
}

/** Room kept clear above a revealed box for the sticky app bar, and below it
    so the box after it shows too. */
const CLEARANCE = 96

/**
 * Brings a box focused from code into the part of the screen the person can
 * see. A box focused by a tap is moved into view by the browser; one focused
 * from a key press is not, on a phone, so Enter used to leave the next score
 * box under the keyboard. The keyboard does not shrink the layout on iOS, only
 * the visual viewport, so that is what the box is measured against.
 */
export function reveal(el: HTMLElement) {
  el.scrollIntoView?.({ block: 'nearest' })
  const vv = window.visualViewport
  if (!vv) return
  const r = el.getBoundingClientRect()
  const top = vv.offsetTop + Math.min(CLEARANCE, vv.height / 4)
  const bottom = vv.offsetTop + vv.height - Math.min(CLEARANCE, vv.height / 4)
  if (r.top < top) window.scrollBy(0, r.top - top)
  else if (r.bottom > bottom) window.scrollBy(0, r.bottom - bottom)
}
