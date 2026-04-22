import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser, setAuthSuper } from '@/test/setup'
import { GET } from './route'

describe('GET /api/competitions/mine', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('super admin sees all comps ordered by id', async () => {
    const rows = [
      { id: 1, name: 'A', slug: 'a' },
      { id: 2, name: 'B', slug: 'b' },
    ]
    mock.queueResult({ data: rows, error: null })

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)

    const call = mock.lastCall!
    expect(call.table).toBe('Competition')
    expect(call.ops.find((o) => o.op === 'order')?.args[0]).toBe('id')
  })

  it('non-super only sees comps where they are CompetitionAdmin', async () => {
    setAuthSuper(false)
    mock.queueResult({ data: [{ id: 1, name: 'Mine', slug: 'mine' }], error: null })

    const res = await GET()
    expect(res.status).toBe(200)

    const call = mock.lastCall!
    expect(call.table).toBe('Competition')
    const select = call.ops.find((o) => o.op === 'select')!
    expect(select.args[0]).toContain('CompetitionAdmin!inner')
    const eqArgs = call.ops.filter((o) => o.op === 'eq').map((o) => o.args[0])
    expect(eqArgs).toContain('CompetitionAdmin.userId')
  })
})
