import { describe, it, expect } from 'vitest'
import { envSchema } from './env'

const valid = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_KEY: 'eyJhb.service.key',
  NEXTAUTH_SECRET: 'a-random-secret',
  ADMIN_PASSWORD: 'long-enough-password',
  NODE_ENV: 'test',
}

describe('envSchema', () => {
  it('accepts a complete env payload', () => {
    expect(() => envSchema.parse(valid)).not.toThrow()
  })

  it('rejects missing SUPABASE_URL', () => {
    const { SUPABASE_URL: _, ...rest } = valid
    expect(() => envSchema.parse(rest)).toThrow(/SUPABASE_URL/)
  })

  it('rejects missing SUPABASE_SERVICE_KEY', () => {
    const { SUPABASE_SERVICE_KEY: _, ...rest } = valid
    expect(() => envSchema.parse(rest)).toThrow(/SUPABASE_SERVICE_KEY/)
  })

  it('rejects missing NEXTAUTH_SECRET', () => {
    const { NEXTAUTH_SECRET: _, ...rest } = valid
    expect(() => envSchema.parse(rest)).toThrow(/NEXTAUTH_SECRET/)
  })

  it('rejects non-URL SUPABASE_URL', () => {
    expect(() => envSchema.parse({ ...valid, SUPABASE_URL: 'not a url' })).toThrow()
  })

  it('requires ADMIN_PASSWORD in production', () => {
    const { ADMIN_PASSWORD: _, ...rest } = valid
    expect(() => envSchema.parse({ ...rest, NODE_ENV: 'production' })).toThrow(/ADMIN_PASSWORD/)
  })

  it('allows missing ADMIN_PASSWORD outside production', () => {
    const { ADMIN_PASSWORD: _, ...rest } = valid
    expect(() => envSchema.parse({ ...rest, NODE_ENV: 'development' })).not.toThrow()
  })

  it('exposes NEXTAUTH_URL as optional', () => {
    expect(() => envSchema.parse({ ...valid, NEXTAUTH_URL: 'https://example.com' })).not.toThrow()
    expect(() => envSchema.parse(valid)).not.toThrow()
  })
})
