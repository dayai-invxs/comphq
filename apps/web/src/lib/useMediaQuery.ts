import { useCallback, useSyncExternalStore } from 'react'

/**
 * Reads a CSS media query from JavaScript and re-renders when it changes.
 *
 * For the layout decisions CSS cannot make on its own — which columns a table
 * is given, which component is rendered — where a `@media` block can only hide
 * what was drawn anyway. Anything that is purely a matter of appearance stays
 * in the stylesheet.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const list = window.matchMedia(query)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  const read = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  }, [query])

  // Nothing here is server-rendered, but the third argument is not optional
  // and a query has no answer without a viewport to ask about.
  return useSyncExternalStore(subscribe, read, () => false)
}
