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
      next.focus()
      next.select()
    }
  }
}
