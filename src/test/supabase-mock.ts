import { vi } from 'vitest'

export type SupabaseResult<T = unknown> = { data: T | null; error: { message: string } | null }

export type ChainCall = {
  table: string
  ops: Array<{ op: string; args: unknown[] }>
}

type ChainOp =
  | 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  | 'eq' | 'neq' | 'in' | 'is' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike'
  | 'order' | 'limit' | 'range'
  | 'single' | 'maybeSingle' | 'returning'

const CHAIN_OPS: ChainOp[] = [
  'select', 'insert', 'update', 'upsert', 'delete',
  'eq', 'neq', 'in', 'is', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike',
  'order', 'limit', 'range',
  'single', 'maybeSingle', 'returning',
]

export type Chain = {
  [K in ChainOp]: (...args: unknown[]) => Chain
} & PromiseLike<SupabaseResult>


/**
 * Chainable mock matching @supabase/supabase-js PostgREST query builder surface.
 *
 * Usage:
 *   const s = createSupabaseMock()
 *   s.queueResult({ data: [{ id: 1 }], error: null })
 *   // ... run code that does s.client.from('X').select().eq('id',1)
 *   expect(s.calls).toEqual([{ table: 'X', ops: [{op:'select',args:[]},{op:'eq',args:['id',1]}] }])
 */
export function createSupabaseMock() {
  const results: SupabaseResult[] = []
  const calls: ChainCall[] = []

  function makeChain(call: ChainCall): Chain {
    const handler: ProxyHandler<object> = {
      get(_t: object, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: SupabaseResult) => unknown, reject?: (e: unknown) => unknown) => {
            const next = results.shift() ?? { data: null, error: null }
            return Promise.resolve(next).then(resolve, reject)
          }
        }
        if (CHAIN_OPS.includes(prop as ChainOp)) {
          return (...args: unknown[]) => {
            call.ops.push({ op: prop, args })
            return new Proxy({}, handler) as Chain
          }
        }
        return undefined
      },
    }
    return new Proxy({}, handler) as Chain
  }

  const from = vi.fn((table: string) => {
    const call: ChainCall = { table, ops: [] }
    calls.push(call)
    return makeChain(call)
  })

  const storage = {
    from: vi.fn<(bucket: string) => {
      upload: (path: string, file: unknown, opts?: unknown) => Promise<{ data: { path: string }; error: null }>
      remove: (paths: string[]) => Promise<{ data: never[]; error: null }>
      getPublicUrl: (path: string) => { data: { publicUrl: string } }
    }>(() => ({
      upload: vi.fn(async () => ({ data: { path: 'mock/path' }, error: null })),
      remove: vi.fn(async () => ({ data: [], error: null })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://mock.supabase.co/x' } })),
    })),
  }

  return {
    client: { from, storage },
    queueResult<T = unknown>(result: SupabaseResult<T>) {
      results.push(result)
    },
    queueResults(...items: SupabaseResult[]) {
      results.push(...items)
    },
    get calls() {
      return calls
    },
    get lastCall(): ChainCall | undefined {
      return calls[calls.length - 1]
    },
    reset() {
      results.length = 0
      calls.length = 0
      from.mockClear()
    },
  }
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>
