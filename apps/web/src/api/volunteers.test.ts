import { describe, expect, it, vi } from 'vitest'
import { volunteersOptions } from './volunteers'
import { queryKeys } from './queryKeys'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet }))

describe('volunteer reads', () => {
  it('asks the endpoint v1 asked, for the slug it was given', () => {
    volunteersOptions('summer').queryFn()
    expect(apiGet).toHaveBeenCalledWith('/api/volunteers?slug=summer')
  })

  it('keys on the shared table, so a mutation can clear it by name', () => {
    expect(volunteersOptions('summer').queryKey).toEqual(queryKeys.volunteers('summer'))
  })

  it('waits for a slug before asking anything', () => {
    expect(volunteersOptions('').enabled).toBe(false)
    expect(volunteersOptions('summer').enabled).toBe(true)
  })
})
