import { describe, expect, it, vi } from 'vitest'
import { postEach } from './postEach'

describe('postEach', () => {
  it('sends each item in turn', async () => {
    const order: string[] = []
    const send = vi.fn(async (n: string) => { order.push(n) })
    await expect(postEach(['a', 'b'], (n) => n, send)).resolves.toBe(2)
    expect(order).toEqual(['a', 'b'])
  })

  it('keeps going past a refusal, then names every refusal', async () => {
    const send = vi.fn(async (n: string) => { if (n !== 'b') throw new Error('taken') })
    await expect(postEach(['a', 'b', 'c'], (n) => n, send))
      .rejects.toThrow('Could not add "a" (taken), "c" (taken)')
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('refuses an empty list rather than claiming an import', async () => {
    await expect(postEach([], String, vi.fn())).rejects.toThrow('Nothing new to import')
  })
})
