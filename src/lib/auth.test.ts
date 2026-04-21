import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { supabaseMock as mock } from '@/test/setup'
import { authorize, ensureSeedUser, authOptions } from './auth'

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('authOptions', () => {
  it('configures JWT session with an 8h maxAge', () => {
    expect(authOptions.session?.strategy).toBe('jwt')
    expect(authOptions.session?.maxAge).toBe(60 * 60 * 8)
  })
})

describe('authorize', () => {
  it('returns null when credentials are missing', async () => {
    expect(await authorize(undefined)).toBeNull()
    expect(await authorize({ username: '', password: '' })).toBeNull()
  })

  it('returns null when user does not exist but still runs bcrypt (timing-equal)', async () => {
    // User lookup: empty (ensureSeedUser path + actual lookup)
    mock.queueResult({ data: [{ id: 1 }], error: null }) // seed check - already has users
    mock.queueResult({ data: null, error: null })        // user lookup returns nothing

    const spy = vi.spyOn(bcrypt, 'compare')
    const result = await authorize({ username: 'ghost', password: 'whatever' })

    expect(result).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1) // bcrypt still invoked despite missing user
    spy.mockRestore()
  })

  it('returns null on wrong password', async () => {
    const hash = await bcrypt.hash('correct-horse', 10)
    mock.queueResult({ data: [{ id: 1 }], error: null })
    mock.queueResult({ data: { id: 1, username: 'admin', password: hash }, error: null })

    const result = await authorize({ username: 'admin', password: 'wrong' })
    expect(result).toBeNull()
  })

  it('returns a user object on valid credentials', async () => {
    const hash = await bcrypt.hash('correct-horse', 10)
    mock.queueResult({ data: [{ id: 1 }], error: null })
    mock.queueResult({ data: { id: 7, username: 'admin', password: hash }, error: null })

    const result = await authorize({ username: 'admin', password: 'correct-horse' })
    expect(result).toEqual({ id: '7', name: 'admin' })
  })
})

describe('ensureSeedUser', () => {
  it('is a no-op when the User table is non-empty', async () => {
    mock.queueResult({ data: [{ id: 1 }], error: null })
    await ensureSeedUser()
    // Only the .select('id') call happened; no upsert
    expect(mock.calls.length).toBe(1)
    expect(mock.calls[0].ops.find((o) => o.op === 'upsert')).toBeUndefined()
  })

  it('seeds the admin user via upsert when the table is empty and ADMIN_PASSWORD is set', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'safe-password-12345')
    mock.queueResult({ data: [], error: null })
    mock.queueResult({ data: null, error: null })

    await ensureSeedUser()

    const upsert = mock.calls.find((c) => c.ops.find((o) => o.op === 'upsert'))!
    const upsertOp = upsert.ops.find((o) => o.op === 'upsert')!
    const row = upsertOp.args[0] as { username: string; password: string }
    const opts = upsertOp.args[1] as { onConflict: string; ignoreDuplicates: boolean }
    expect(row.username).toBe('admin')
    expect(opts.onConflict).toBe('username')
    expect(opts.ignoreDuplicates).toBe(true)
    // Password is hashed, not stored raw
    expect(row.password).not.toBe('safe-password-12345')
    expect(await bcrypt.compare('safe-password-12345', row.password)).toBe(true)
  })

  it('throws in production when ADMIN_PASSWORD is not set', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ADMIN_PASSWORD', '')
    mock.queueResult({ data: [], error: null })

    await expect(ensureSeedUser()).rejects.toThrow(/ADMIN_PASSWORD/)
  })

  it('uses the dev fallback in development when ADMIN_PASSWORD is unset', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ADMIN_PASSWORD', '')
    mock.queueResult({ data: [], error: null })
    mock.queueResult({ data: null, error: null })

    await expect(ensureSeedUser()).resolves.toBeUndefined()
    const upsert = mock.calls.find((c) => c.ops.find((o) => o.op === 'upsert'))!
    expect(upsert).toBeDefined()
  })
})
