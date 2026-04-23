import { vi } from 'vitest'

/**
 * Chainable Drizzle mock — mirrors the supabase-mock pattern. Tests queue
 * results and record calls; route code sees a query builder that resolves
 * to those pre-staged rows.
 *
 * Supports the subset the app uses:
 *   db.select(...).from(t).where(...).orderBy(...).limit(...).innerJoin(...)
 *   db.insert(t).values(...).returning()
 *   db.insert(t).values(...).onConflictDoUpdate(...)
 *   db.update(t).set(...).where(...).returning()
 *   db.delete(t).where(...)
 *   db.execute(sql...)
 *   db.transaction(async (tx) => ...)
 *
 * Usage:
 *   drizzleMock.queueResult([{ id: 1, slug: 'default' }])
 *   // route executes `db.select().from(competition)...` → receives that array
 */

type Call = { method: string; args: unknown[] }

export function createDrizzleMock() {
  const results: unknown[] = []
  const calls: Call[] = []

  function record(method: string, args: unknown[]) {
    calls.push({ method, args })
  }

  function nextResult(): unknown {
    return results.length > 0 ? results.shift() : []
  }

  function makeChain() {
    let currentResult: unknown = undefined
    let consumed = false

    // Lazily pop a result at await time. Allows the test to queue after the
    // chain starts being built (rare, but keeps semantics predictable).
    const handler: ProxyHandler<object> = {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
            if (!consumed) {
              currentResult = nextResult()
              consumed = true
            }
            return Promise.resolve(currentResult).then(resolve, reject)
          }
        }
        // Chain methods: record + return the same proxy.
        return (...args: unknown[]) => {
          record(String(prop), args)
          return new Proxy({}, handler)
        }
      },
    }
    return new Proxy({}, handler) as unknown
  }

  const db = {
    select: vi.fn((...args: unknown[]) => {
      record('select', args)
      return makeChain() as { from: (...a: unknown[]) => unknown }
    }),
    insert: vi.fn((...args: unknown[]) => {
      record('insert', args)
      return makeChain() as { values: (...a: unknown[]) => unknown }
    }),
    update: vi.fn((...args: unknown[]) => {
      record('update', args)
      return makeChain() as { set: (...a: unknown[]) => unknown }
    }),
    delete: vi.fn((...args: unknown[]) => {
      record('delete', args)
      return makeChain() as { where: (...a: unknown[]) => unknown }
    }),
    execute: vi.fn(async (...args: unknown[]) => {
      record('execute', args)
      return nextResult()
    }),
    transaction: vi.fn(async (fn: (tx: typeof db) => Promise<unknown>) => {
      record('transaction', [])
      return fn(db)
    }),
  }

  return {
    db,
    queueResult(result: unknown) {
      results.push(result)
    },
    queueResults(...items: unknown[]) {
      results.push(...items)
    },
    get calls() {
      return calls
    },
    reset() {
      results.length = 0
      calls.length = 0
      db.select.mockClear()
      db.insert.mockClear()
      db.update.mockClear()
      db.delete.mockClear()
      db.execute.mockClear()
      db.transaction.mockClear()
    },
  }
}

export type DrizzleMock = ReturnType<typeof createDrizzleMock>
