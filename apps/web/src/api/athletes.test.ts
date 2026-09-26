import { describe, expect, it, vi } from 'vitest'
import { athletesOptions } from './athletes'
import { queryKeys } from './queryKeys'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet }))

describe('athlete reads', () => {
  it('asks the endpoint v1 asked, for the slug it was given', () => {
    athletesOptions('summer').queryFn()
    expect(apiGet).toHaveBeenCalledWith('/api/athletes?slug=summer')
  })

  it('keys on the shared table, so a mutation can clear it by name', () => {
    expect(athletesOptions('summer').queryKey).toEqual(queryKeys.athletes('summer'))
  })

  it('waits for a slug before asking anything', () => {
    expect(athletesOptions('').enabled).toBe(false)
    expect(athletesOptions('summer').enabled).toBe(true)
  })
})
