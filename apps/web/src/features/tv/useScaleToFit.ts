import { useLayoutEffect, useRef, type RefObject } from 'react'

// v1: the useLayoutEffect at src/app/[slug]/TV/page.tsx:71, carried over as a
// hook because it is a mechanism rather than markup.
//
// A scoreboard has one screen, no scrollbar and nobody near it, so content
// taller than the screen has to be shrunk rather than cut off. It is measured
// at natural size — the reset is what stops a second pass from scaling an
// already scaled box — and shrunk by exactly the ratio it overflows by.
//
// v1's own note on why this is `transform` and not `zoom`: the gym displays run
// webOS 4.x, which is Chrome 56. `transform-origin` and the width compensation
// travel with it — scaling from the centre would lift the content off two
// edges, and scaling from the top left would leave a gap on the right that the
// widened box fills.

export function useScaleToFit(deps: readonly unknown[]): {
  containerRef: RefObject<HTMLDivElement | null>
  contentRef: RefObject<HTMLDivElement | null>
} {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return
    content.style.transform = ''
    content.style.transformOrigin = ''
    content.style.width = ''
    const available = container.clientHeight
    const natural = content.scrollHeight
    if (natural > available) {
      const ratio = available / natural
      content.style.transform = `scale(${ratio})`
      content.style.transformOrigin = 'top left'
      content.style.width = `${(100 / ratio).toFixed(4)}%`
    }
    // The caller names what it redraws for; the hook has nothing of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { containerRef, contentRef }
}
