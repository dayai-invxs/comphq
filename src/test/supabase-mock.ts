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

  // RPC invocations land in `calls` as a synthetic "table" = `rpc:<fn>`.
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    const call: ChainCall = { table: `rpc:${fn}`, ops: [{ op: 'rpc', args: args ? [args] : [] }] }
    calls.push(call)
    const next = results.shift() ?? { data: null, error: null }
    return next
  })

  // Supabase Auth admin-API surface. Each method records itself in `calls`
  // and consumes the next queued result.
  const authAdmin = {
    listUsers: vi.fn(async (args?: unknown) => {
      calls.push({ table: 'auth:listUsers', ops: [{ op: 'auth', args: args ? [args] : [] }] })
      return results.shift() ?? { data: { users: [] }, error: null }
    }),
    createUser: vi.fn(async (args?: unknown) => {
      calls.push({ table: 'auth:createUser', ops: [{ op: 'auth', args: args ? [args] : [] }] })
      return results.shift() ?? { data: { user: null }, error: null }
    }),
    deleteUser: vi.fn(async (id?: unknown) => {
      calls.push({ table: 'auth:deleteUser', ops: [{ op: 'auth', args: id ? [id] : [] }] })
      return results.shift() ?? { data: null, error: null }
    }),
    updateUserById: vi.fn(async (id: unknown, args?: unknown) => {
      calls.push({ table: 'auth:updateUserById', ops: [{ op: 'auth', args: [id, args] }] })
      return results.shift() ?? { data: { user: null }, error: null }
    }),
    generateLink: vi.fn(async (args?: unknown) => {
      calls.push({ table: 'auth:generateLink', ops: [{ op: 'auth', args: args ? [args] : [] }] })
      return results.shift() ?? { data: null, error: null }
    }),
  }

  const authResetPasswordForEmail = vi.fn(async (email: string, opts?: unknown) => {
    calls.push({ table: 'auth:resetPasswordForEmail', ops: [{ op: 'auth', args: [email, opts] }] })
    return results.shift() ?? { data: null, error: null }
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
    client: {
      from,
      storage,
      rpc,
      auth: {
        admin: authAdmin,
        resetPasswordForEmail: authResetPasswordForEmail,
      },
    },
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
      rpc.mockClear()
    },
  }
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>
