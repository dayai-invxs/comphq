// @vitest-environment node
//
// It reads v1's directory tree rather than rendering anything, and under jsdom
// `import.meta.url` is the URL Vite served the module from, not a file path.
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RouteObject } from 'react-router'
import { routes } from './routes'

// v1's routing was its directory layout, so the route table is the one part of
// the port with no file to copy — it has to be re-derived, which is exactly
// what went wrong in v2. This derives v1's routes from v1's own tree instead
// and demands the table match: a page v1 serves and v3 does not is a failure
// here rather than a 404 someone finds later.

const V1_APP = fileURLToPath(new URL('../../../../../comphq/src/app', import.meta.url))

function pagesIn(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return pagesIn(full, base)
    return e.name === 'page.tsx' ? [`/${relative(base, dir).replaceAll('\\', '/')}`] : []
  })
}

// Next's [slug] is react-router's :slug. Everything else is already the path.
const v1Routes = pagesIn(V1_APP)
  .map((p) => (p === '/.' ? '/' : p).replace(/\[(\w+)\]/g, ':$1'))
  .sort()

function flatten(list: readonly RouteObject[], prefix = ''): string[] {
  return list.flatMap((r) => {
    const path = r.path === undefined ? prefix : `${prefix}/${r.path}`.replace(/\/+/g, '/')
    const here = r.path === undefined ? [] : [path === '' ? '/' : path]
    return [...here, ...flatten(r.children ?? [], path === '/' ? '' : path)]
  })
}

// Paths v3 serves that v1 does not, each with the reason it exists. The
// table may grow, but not silently. A URL is functionality (a QR code printed
// for a gym display outlives any redesign), so v1's addresses are still all
// required; this is the list of what was added on top of them.
const ADDED: Record<string, string> = {
  '/styleguide':
    'The design language on one page — every primitive and every token against '
    + 'the palette. Dev-only: routes.tsx adds it under import.meta.env.DEV, so it '
    + 'is absent from the production build.',
}

// Paths v1 serves that v3 deliberately does not, each with the reason it was
// dropped — the mirror of ADDED, and held to the same standard: a URL only
// leaves the table with a written decision, never by omission.
const REMOVED: Record<string, string> = {
  '/hero':
    'The marketing poster scene. Removed 2026-08: it carried its own display '
    + 'font, a 491KB cutout image and the gsap entrance animation for a page '
    + 'no competition workflow links to, and nothing else in the app used any '
    + 'of them.',
}

describe('route table', () => {
  it('serves every page v1 serves, less the ones removed by decision', () => {
    const required = v1Routes.filter((p) => !(p in REMOVED))
    expect(flatten(routes)).toEqual(expect.arrayContaining(required))
  })

  // A path with no stated reason is a path nobody decided to add.
  it('adds nothing beyond v1 without a written reason', () => {
    const extra = flatten(routes).filter((p) => !v1Routes.includes(p))
    expect(extra.sort()).toEqual(Object.keys(ADDED).sort())
    for (const reason of Object.values(ADDED)) expect(reason.length).toBeGreaterThan(40)
  })

  // And the mirror: a removal names a v1 path, states its reason, and the
  // table really does not serve it — a REMOVED entry for a living route is a
  // decision nobody carried out.
  it('removes nothing from v1 without a written reason', () => {
    const served = flatten(routes)
    for (const [path, reason] of Object.entries(REMOVED)) {
      expect(v1Routes).toContain(path)
      expect(served).not.toContain(path)
      expect(reason.length).toBeGreaterThan(40)
    }
  })

  it('found v1s pages at all', () => {
    expect(v1Routes.length).toBe(24)
  })
})
