import { afterEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn(() => ({ auth: {} }))
vi.mock('@supabase/supabase-js', () => ({ createClient }))

async function load(env: Record<string, string | undefined>) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', env.VITE_SUPABASE_URL ?? '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', env.VITE_SUPABASE_ANON_KEY ?? '')
  vi.stubEnv('VITE_FUNCTIONS_URL', env.VITE_FUNCTIONS_URL ?? '')
  vi.stubEnv('VITE_FUNCTIONS_REGION', env.VITE_FUNCTIONS_REGION ?? '')
  return import('./supabase')
}

const ENV = { VITE_SUPABASE_URL: 'https://project.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key' }

afterEach(() => {
  vi.unstubAllEnvs()
  createClient.mockClear()
})

describe('getSupabaseClient', () => {
  it('builds the client from the Vite environment', async () => {
    const { getSupabaseClient } = await load(ENV)
    getSupabaseClient()
    expect(createClient).toHaveBeenCalledWith(ENV.VITE_SUPABASE_URL, ENV.VITE_SUPABASE_ANON_KEY, expect.anything())
  })

  // One client means one Realtime socket. v1 memoized for the same reason.
  it('returns the same instance every time', async () => {
    const { getSupabaseClient } = await load(ENV)
    expect(getSupabaseClient()).toBe(getSupabaseClient())
    expect(createClient).toHaveBeenCalledTimes(1)
  })

  it('names both variables when either is missing', async () => {
    const { getSupabaseClient } = await load({ VITE_SUPABASE_URL: ENV.VITE_SUPABASE_URL })
    expect(() => getSupabaseClient()).toThrow(/VITE_SUPABASE_URL.*VITE_SUPABASE_ANON_KEY/s)
  })

  it('does not build a client at import time', async () => {
    await load(ENV)
    expect(createClient).not.toHaveBeenCalled()
  })
})

// The API layer needs the same two values to build Edge Function URLs and the
// apikey header. They are read and validated here so there is one place that
// knows the variable names.
describe('getSupabaseEnv', () => {
  it('returns the values the app is configured by', async () => {
    const { getSupabaseEnv } = await load(ENV)
    expect(getSupabaseEnv()).toEqual({
      url: ENV.VITE_SUPABASE_URL,
      anonKey: ENV.VITE_SUPABASE_ANON_KEY,
      functionsUrl: ENV.VITE_SUPABASE_URL,
    })
  })

  it('drops a trailing slash, so a joined path never doubles up', async () => {
    const { getSupabaseEnv } = await load({ ...ENV, VITE_SUPABASE_URL: 'https://project.supabase.co/' })
    expect(getSupabaseEnv().url).toBe('https://project.supabase.co')
  })

  it('names both variables when either is missing', async () => {
    const { getSupabaseEnv } = await load({ VITE_SUPABASE_ANON_KEY: ENV.VITE_SUPABASE_ANON_KEY })
    expect(() => getSupabaseEnv()).toThrow(/VITE_SUPABASE_URL.*VITE_SUPABASE_ANON_KEY/s)
  })

  // Deployed, the functions live under the project URL. Locally they are a
  // `supabase functions serve` process on another port, and auth still has to
  // reach the hosted server, so the two origins have to be settable apart.
  it('serves functions from the project by default', async () => {
    const { getSupabaseEnv } = await load(ENV)
    expect(getSupabaseEnv().functionsUrl).toBe(ENV.VITE_SUPABASE_URL)
  })

  it('lets VITE_FUNCTIONS_URL move them without moving auth', async () => {
    const { getSupabaseEnv } = await load({ ...ENV, VITE_FUNCTIONS_URL: 'http://localhost:54321/' })
    const env = getSupabaseEnv()
    expect(env.functionsUrl).toBe('http://localhost:54321')
    expect(env.url).toBe(ENV.VITE_SUPABASE_URL)
  })

  // Functions run in whatever region the gateway picks unless told otherwise,
  // and the database lives in exactly one. The variable names the database's
  // region so every invocation runs next to its data.
  it('carries VITE_FUNCTIONS_REGION when set', async () => {
    const { getSupabaseEnv } = await load({ ...ENV, VITE_FUNCTIONS_REGION: 'us-west-2' })
    expect(getSupabaseEnv().functionsRegion).toBe('us-west-2')
  })

  it('leaves the region unset by default, as local serving has no regions', async () => {
    const { getSupabaseEnv } = await load(ENV)
    expect(getSupabaseEnv().functionsRegion).toBeUndefined()
  })
})
