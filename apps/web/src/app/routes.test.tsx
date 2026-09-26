// @vitest-environment node
//
// Same reason as routes.parity.test.ts: it reads v1's tree, it renders nothing.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { isValidElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { RouteObject } from 'react-router'
import { Pending } from './Pending'
import { PublicApp } from './PublicApp'
import { routes } from './routes'

// The route table is complete before the pages are, so every path v1 serves
// resolves to something from day one. This is the inventory of what those
// somethings are still standing in for: a page lands, its file name moves into
// PORTED, and the Phase 8 gate is that PENDING is empty.
//
// A route reaches its page either eagerly, through `element`, or on demand,
// through `lazy` — every page now does the latter. Both are a page; neither
// is a blank screen; so both count here.
//
// hero/page.tsx is absent on purpose: /hero was removed by decision, and
// routes.parity.test.ts's REMOVED map holds the reason.

const V1_APP = fileURLToPath(new URL('../../../../../comphq/src/app', import.meta.url))

const PORTED: string[] = [
  'page.tsx',
  'login/page.tsx',
  'forgot-password/page.tsx',
  'reset-password/page.tsx',
  'control/page.tsx',
  'ops/page.tsx',
  '[slug]/athlete-overview/page.tsx',
  '[slug]/control/page.tsx',
  '[slug]/equipment/page.tsx',
  '[slug]/judges/page.tsx',
  '[slug]/leaderboard/page.tsx',
  '[slug]/ops/page.tsx',
  '[slug]/page.tsx',
  '[slug]/TV/page.tsx',
  '[slug]/admin/page.tsx',
  '[slug]/admin/leaderboard/page.tsx',
  '[slug]/admin/people/page.tsx',
  '[slug]/admin/setup/page.tsx',
  '[slug]/admin/users/page.tsx',
  '[slug]/admin/workouts/page.tsx',
  '[slug]/admin/workouts/[id]/page.tsx',
  'admin/page.tsx',
  'admin/users/page.tsx',
]

function walk(list: readonly RouteObject[], prefix = ''): { path: string; page: string | null }[] {
  return list.flatMap((r) => {
    const path = r.path === undefined ? prefix || '/' : `${prefix}/${r.path}`.replace(/\/+/g, '/')
    const element = r.element
    const page = isValidElement(element) && element.type === Pending
      ? (element.props as { page: string }).page
      : null
    const here = r.element || r.lazy ? [{ path, page }] : []
    return [...here, ...walk(r.children ?? [], path === '/' ? '' : path)]
  })
}

const entries = walk(routes)
const pending = entries.filter((e) => e.page !== null)

describe('route table', () => {
  it('gives every path an element, so no route resolves to a blank screen', () => {
    expect(entries.every((e) => e.path.length > 0)).toBe(true)
    expect(entries.length).toBeGreaterThan(0)
  })

  // A placeholder that names a file v1 does not have is a placeholder nobody
  // can act on.
  it('names a real v1 page in every placeholder', () => {
    for (const { page } of pending) expect(existsSync(join(V1_APP, page!))).toBe(true)
  })

  it('stands in for exactly the pages that are not ported yet', () => {
    const ported = pending.filter((e) => PORTED.includes(e.page!))
    expect(ported).toEqual([])
    expect(new Set(pending.map((e) => e.page)).size).toBe(pending.length)
  })

  // The Phase 8 gate, and it is met: every page v1 serves is either ported
  // (23) or removed by written decision (/hero, in the parity test's REMOVED
  // map). A new placeholder puts this back in the red.
  it('has nothing left to port', () => {
    expect(PORTED).toHaveLength(23)
    expect(pending).toEqual([])
  })

  // PublicApp and PublicShell each draw a ScreenContent — a <main> with the
  // page gutter. With the :slug subtree nested under PublicApp, a spectator
  // page rendered inside both: a doubled gutter and two main landmarks.
  it('keeps the competition frames out of the public frame', () => {
    const publicApp = routes[0].children!.find(
      (r) => isValidElement(r.element) && r.element.type === PublicApp,
    )!
    const paths = (list: readonly RouteObject[]): string[] =>
      list.flatMap((r) => [...(r.path ? [r.path] : []), ...paths(r.children ?? [])])
    expect(paths(publicApp.children ?? [])).not.toContain(':slug')
  })
})
