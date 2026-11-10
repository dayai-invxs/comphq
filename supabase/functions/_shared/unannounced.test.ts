import { describe, expect, it } from 'vitest'
import { isUnannounced } from './unannounced'

describe('isUnannounced', () => {
  it('hides a secret workout until it goes active', () => {
    expect(isUnannounced({ secret: true, status: 'draft' })).toBe(true)
    expect(isUnannounced({ secret: true, status: 'active' })).toBe(false)
    expect(isUnannounced({ secret: true, status: 'completed' })).toBe(false)
  })

  it('never hides a workout that is not secret', () => {
    expect(isUnannounced({ secret: false, status: 'draft' })).toBe(false)
  })
})
