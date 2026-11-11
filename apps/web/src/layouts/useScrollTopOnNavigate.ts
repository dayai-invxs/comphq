import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router'

/**
 * Starts each page at its top. A shell keeps the same content element as the
 * pages inside it change, so a page opened from halfway down another opened
 * halfway down too — and below the rail's step the document itself is what
 * scrolls (AdminShell.module.css), so that offset carried over as well.
 *
 * Returns the ref for the shell's scrolling content element.
 */
export function useScrollTopOnNavigate<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const { pathname } = useLocation()

  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = 0
    if (window.scrollY !== 0) window.scrollTo(0, 0)
  }, [pathname])

  return ref
}
