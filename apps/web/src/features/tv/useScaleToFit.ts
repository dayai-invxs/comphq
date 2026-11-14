import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

// v1: the useLayoutEffect at src/app/[slug]/TV/page.tsx:71, carried over as a
// hook because it is a mechanism rather than markup.
//
// A scoreboard has one screen, no scrollbar and nobody near it, so content
// taller than the screen has to be shrunk rather than cut off. It is measured
// at natural size — the reset is what stops a second pass from scaling an
// already scaled box — and shrunk by the ratio it overflows by (see below).
//
// Before it shrinks anything it tries the content's other arrangements, when
// the content has some (`layouts` > 1: the schedule can show fewer heats and
// spread lanes into columns). It draws each in turn, in the order the content
// prefers them, and keeps the first that fits at full size without running
// off the side of the screen. When none does it
// goes back to the one that needs the least shrinking. Every try happens in a
// layout effect, so the screen is only ever painted with the one it settles on.
//
// The width given back changes the content's height when the content reflows
// with its width — the leaderboard's grid fits more division panels across a
// wider box, so it gets shorter. Shrinking by the ratio measured at natural
// width then leaves the bottom of the screen empty and the type smaller than
// it needs to be (at a 150% board zoom, smaller than at 100%). So the ratio is
// searched for: the largest that fits once the width is given back.
//
// v1's own note on why this is `transform` and not `zoom`: the gym displays run
// webOS 4.x, which is Chrome 56. `transform-origin` and the width compensation
// travel with it — scaling from the centre would lift the content off two
// edges, and scaling from the top left would leave a gap on the right that the
// widened box fills.

export function useScaleToFit(deps: readonly unknown[], layouts = 1): {
  containerRef: RefObject<HTMLDivElement | null>
  contentRef: RefObject<HTMLDivElement | null>
  /** Which of the content's arrangements to draw, from 0. */
  layout: number
} {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState(0)

  // What the last search was for, how far through it is, and the ratio each
  // arrangement it has drawn would need.
  const lastDeps = useRef<readonly unknown[] | null>(null)
  const searching = useRef(false)
  const ratios = useRef<number[]>([])

  useLayoutEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return

    const prev = lastDeps.current
    if (!prev || prev.length !== deps.length || deps.some((d, i) => !Object.is(d, prev[i]))) {
      lastDeps.current = deps
      ratios.current = []
      searching.current = layouts > 1
      // A new search starts from the preferred arrangement; this effect runs
      // again once it is drawn.
      if (layout !== 0) {
        setLayout(0)
        return
      }
    }

    content.style.transform = ''
    content.style.transformOrigin = ''
    content.style.width = ''
    // The container's padding is inside clientHeight but is not room the
    // content can use: what reaches into the bottom padding is clipped.
    const pad = getComputedStyle(container)
    const available = container.clientHeight - (parseFloat(pad.paddingTop) || 0) - (parseFloat(pad.paddingBottom) || 0)
    const natural = content.scrollHeight
    // An arrangement wider than the screen (a panel spanning more of a grid's
    // tracks than it has) would be cut off at the side, which shrinking does
    // not cure: it is never kept.
    const sideways = content.scrollWidth > content.clientWidth + 1
    const ratio = natural > available && !sideways ? fittedRatio(content, available, natural) : 1

    if (searching.current) {
      ratios.current[layout] = sideways ? 0 : ratio
      if ((ratio < 1 || sideways) && layout + 1 < layouts) {
        setLayout(layout + 1)
        return
      }
      searching.current = false
      if (ratio < 1 || sideways) {
        // Nothing fits: the earliest of the arrangements that shrink least.
        const best = ratios.current.indexOf(Math.max(...ratios.current))
        if (best !== layout) {
          setLayout(best)
          return
        }
      }
    }

    content.style.width = ''
    if (ratio < 1) {
      content.style.transform = `scale(${ratio})`
      content.style.transformOrigin = 'top left'
      content.style.width = `${(100 / ratio).toFixed(4)}%`
    }
    // The caller names what it redraws for; the hook adds the arrangement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, layout, layouts])

  return { containerRef, contentRef, layout }
}

/** How far content taller than `available` has to shrink, with the width the
    shrink takes given back, as it will be when drawn. The plain ratio at
    natural width always fits (a wider box is never taller); a wider box can be
    shorter, so a larger ratio may fit too. Halved down to under a percent:
    each try is one layout of the board. Leaves the width set; the caller
    clears or replaces it. */
function fittedRatio(content: HTMLElement, available: number, natural: number): number {
  const fits = (r: number) => {
    content.style.width = `${(100 / r).toFixed(4)}%`
    return content.scrollHeight * r <= available && content.scrollWidth <= content.clientWidth + 1
  }
  let lo = available / natural
  let hi = 1
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}
