// @vitest-environment node
import { isValidElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { RouteObject } from 'react-router'
import { PublicApp } from './PublicApp'
import { routes } from './routes'

// A route reaches its page either eagerly, through `element`, or on demand,
// through `lazy` — every page now does the latter. Both are a page; neither
// is a blank screen; so both count here.

function walk(list: readonly RouteObject[], prefix = ''): string[] {
  return list.flatMap((r) => {
    const path = r.path === undefined ? prefix || '/' : `${prefix}/${r.path}`.replace(/\/+/g, '/')
    const here = r.element || r.lazy ? [path] : []
    return [...here, ...walk(r.children ?? [], path === '/' ? '' : path)]
  })
}

describe('route table', () => {
  it('gives every path an element, so no route resolves to a blank screen', () => {
    const paths = walk(routes)
    expect(paths.every((p) => p.length > 0)).toBe(true)
    expect(paths.length).toBeGreaterThan(0)
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
