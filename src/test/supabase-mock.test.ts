import { describe, it, expect } from 'vitest'
import { createSupabaseMock } from './supabase-mock'

describe('createSupabaseMock', () => {
  it('records chain calls', async () => {
    const s = createSupabaseMock()
    s.queueResult({ data: [{ id: 1 }], error: null })

    const result = await s.client.from('Athlete').select('*').eq('id', 1).order('name')

    expect(result).toEqual({ data: [{ id: 1 }], error: null })
    expect(s.lastCall).toEqual({
      table: 'Athlete',
      ops: [
        { op: 'select', args: ['*'] },
        { op: 'eq', args: ['id', 1] },
        { op: 'order', args: ['name'] },
      ],
    })
  })

  it('returns default empty result if nothing queued', async () => {
    const s = createSupabaseMock()
    const result = await s.client.from('X').select()
    expect(result).toEqual({ data: null, error: null })
  })

  it('queues multiple results in order', async () => {
    const s = createSupabaseMock()
    s.queueResults(
      { data: [{ id: 1 }], error: null },
      { data: [{ id: 2 }], error: null },
    )
    const a = await s.client.from('A').select()
    const b = await s.client.from('B').select()
    expect(a.data).toEqual([{ id: 1 }])
    expect(b.data).toEqual([{ id: 2 }])
  })

  it('supports terminal methods single() and maybeSingle()', async () => {
    const s = createSupabaseMock()
    s.queueResult({ data: { id: 1 }, error: null })
    const result = await s.client.from('A').select().eq('id', 1).single()
    expect(result).toEqual({ data: { id: 1 }, error: null })
  })

  it('exposes storage API', () => {
    const s = createSupabaseMock()
    expect(s.client.storage.from('logos')).toMatchObject({
      upload: expect.any(Function),
      getPublicUrl: expect.any(Function),
    })
  })
})
