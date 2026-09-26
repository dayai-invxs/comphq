// jsdom ships no `window.matchMedia`, and the app asks it one question the
// stylesheet cannot answer for it: how wide the viewport is (a table that is
// given fewer columns on a phone, rather than the same columns drawn off the
// side of it).
//
// jsdom has no layout, so a width query is answered from `window.innerWidth`,
// which is the one width in the document a spec can set and the stub can read.
// Anything else — pointer, hover, colour — reports `false`, which is what a
// browser does with a feature it cannot match.

type Listener = (event: MediaQueryListEvent) => void

const WIDTH = /^\(\s*(min|max)-width:\s*(\d+)px\s*\)$/

// jsdom's own default, so a spec that never mentions a viewport gets the
// laptop it has always been getting.
const DEFAULT_WIDTH = 1024

let width = DEFAULT_WIDTH
const lists = new Set<{ query: string; listeners: Set<Listener> }>()

function evaluate(query: string): boolean {
  const match = WIDTH.exec(query)
  if (match) {
    const px = Number(match[2])
    return match[1] === 'min' ? width >= px : width <= px
  }
  return false
}

function announce() {
  for (const { query, listeners } of lists) {
    for (const listener of listeners) {
      listener({ media: query, matches: evaluate(query) } as MediaQueryListEvent)
    }
  }
}

function create(query: string): MediaQueryList {
  const listeners = new Set<Listener>()
  lists.add({ query, listeners })
  return {
    media: query,
    // A getter, so a consumer that re-reads `matches` off a held list after
    // the viewport changes sees the new answer rather than the old one.
    get matches() { return evaluate(query) },
    onchange: null,
    addListener: (l: Listener) => listeners.add(l),
    removeListener: (l: Listener) => listeners.delete(l),
    addEventListener: (_type: string, l: Listener) => listeners.add(l),
    removeEventListener: (_type: string, l: Listener) => listeners.delete(l),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList
}

function applyWidth() {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

export function installMatchMedia() {
  window.matchMedia = ((query: string) => create(query)) as typeof window.matchMedia
  applyWidth()
}

/** Stands in for the window. Set it before rendering for the viewport a spec
    is about, or during, for a phone that has just been turned on its side. */
export function setViewport(px: number) {
  width = px
  applyWidth()
  announce()
}

/** Back to the default every test starts from: a laptop. */
export function resetMatchMedia() {
  width = DEFAULT_WIDTH
  lists.clear()
}
