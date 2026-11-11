import { AsyncLocalStorage } from 'node:async_hooks'

// Next gave ambient per-request state via cookies() and React cache().
// Deno has no ambient request, so one AsyncLocalStorage carries everything
// that is scoped to a single request. Two stores would be two answers to
// "what request is this".
//
// Anything cached here MUST be request-scoped. A module-level cache would
// outlive the request and serve one tenant's data to the next.
export type RequestContext = {
  authHeader: string | null
  competitions: Map<string, unknown>
  /** Who the request turned out to be, once a route has checked: the signed-in
      user, and the competition their access was checked against. The router
      writes the audit trail from it. */
  actor: { userId: string; email: string | null; competitionId: number | null } | null
}

const store = new AsyncLocalStorage<RequestContext>()

export function withRequestContext<T>(req: Request, fn: () => Promise<T>): Promise<T> {
  const ctx: RequestContext = {
    authHeader: req.headers.get('Authorization'),
    competitions: new Map(),
    actor: null,
  }
  return store.run(ctx, fn)
}

export function getRequestContext(): RequestContext | undefined {
  return store.getStore()
}
