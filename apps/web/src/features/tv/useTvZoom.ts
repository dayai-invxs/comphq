import { useCallback, useState } from 'react'

// The board's own zoom, set with the + and − in its bar. Screens differ — a
// 43-inch TV over the rig, a projector on the far wall — and the type that
// reads from across one room is too small or too big in the next.
//
// Kept per screen in the browser, not on the competition: each TV is set for
// the room it hangs in, and it should come back at that size after a reload.
// Storage can be missing or refuse (a private window, a locked-down TV
// browser), in which case the board simply starts at 100% again.

const KEY = 'comphq:tvZoom'
export const TV_ZOOM_MIN = 0.5
export const TV_ZOOM_MAX = 2
const STEP = 0.1

/** Rounded to the step, so 0.1 + 0.2 lands on 0.3 and not 0.30000000000000004,
    and clamped to the range. */
function clean(z: number) {
  return Math.min(TV_ZOOM_MAX, Math.max(TV_ZOOM_MIN, Math.round(z / STEP) / Math.round(1 / STEP)))
}

function read(): number {
  try {
    const z = Number(window.localStorage.getItem(KEY))
    return Number.isFinite(z) && z > 0 ? clean(z) : 1
  } catch {
    return 1
  }
}

function write(z: number) {
  try {
    if (z === 1) window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, String(z))
  } catch {
    // Not kept, but the board still shows it until the page reloads.
  }
}

export function useTvZoom() {
  const [zoom, setZoom] = useState(read)
  const change = useCallback((by: number) => {
    setZoom((z) => {
      const next = clean(z + by)
      write(next)
      return next
    })
  }, [])
  return {
    zoom,
    zoomIn: useCallback(() => change(STEP), [change]),
    zoomOut: useCallback(() => change(-STEP), [change]),
  }
}
