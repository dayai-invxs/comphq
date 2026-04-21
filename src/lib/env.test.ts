import { describe, it, expect } from 'vitest'
import { envSchema } from './env'

const valid = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_KEY: 'eyJhb.service.key',
  NEXTAUTH_SECRET: 'a-random-secret',
  ADMIN_PASSWORD: 'long-enough-password',
  NODE_ENV: 'test',
}

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj }
  delete copy[key]
  return copy
}

describe('envSchema', () => {
  it('accepts a complete env payload', () => {
    expect(() => envSchema.parse(valid)).not.toThrow()
  })

  it('rejects missing SUPABASE_URL', () => {
    expect(() => envSchema.parse(omit(valid, 'SUPABASE_URL'))).toThrow(/SUPABASE_URL/)
  })

  it('rejects missing SUPABASE_SERVICE_KEY', () => {
    expect(() => envSchema.parse(omit(valid, 'SUPABASE_SERVICE_KEY'))).toThrow(/SUPABASE_SERVICE_KEY/)
  })

  it('rejects missing NEXTAUTH_SECRET', () => {
    expect(() => envSchema.parse(omit(valid, 'NEXTAUTH_SECRET'))).toThrow(/NEXTAUTH_SECRET/)
  })

  it('rejects non-URL SUPABASE_URL', () => {
    expect(() => envSchema.parse({ ...valid, SUPABASE_URL: 'not a url' })).toThrow()
  })

  it('allows missing ADMIN_PASSWORD regardless of NODE_ENV (runtime check lives in auth.ts)', () => {
    const rest = omit(valid, 'ADMIN_PASSWORD')
    expect(() => envSchema.parse({ ...rest, NODE_ENV: 'production' })).not.toThrow()
    expect(() => envSchema.parse({ ...rest, NODE_ENV: 'development' })).not.toThrow()
  })

  it('exposes NEXTAUTH_URL as optional', () => {
    expect(() => envSchema.parse({ ...valid, NEXTAUTH_URL: 'https://example.com' })).not.toThrow()
    expect(() => envSchema.parse(valid)).not.toThrow()
  })
})
