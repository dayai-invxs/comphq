import { describe, it, expect } from 'vitest'
import { envSchema } from './env'

const valid = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_KEY: 'eyJhb.service.key',
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-publishable-key',
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

  it('rejects missing NEXT_PUBLIC_SUPABASE_URL', () => {
    expect(() => envSchema.parse(omit(valid, 'NEXT_PUBLIC_SUPABASE_URL'))).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('rejects missing NEXT_PUBLIC_SUPABASE_ANON_KEY', () => {
    expect(() => envSchema.parse(omit(valid, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'))).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })

  it('rejects non-URL SUPABASE_URL', () => {
    expect(() => envSchema.parse({ ...valid, SUPABASE_URL: 'not a url' })).toThrow()
  })
})
