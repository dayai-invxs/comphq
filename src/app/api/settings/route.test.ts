import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { GET, PATCH } from './route'

describe('GET /api/settings', () => {
  it('returns showBib=true by default', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await GET(new Request('http://test/api/settings?slug=test'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ showBib: true })
  })

  it('returns showBib=false when stored as false', async () => {
    mock.queueResult({ data: { value: 'false' }, error: null })
    const res = await GET(new Request('http://test/api/settings?slug=test'))
    expect(await res.json()).toMatchObject({ showBib: false })
  })
})

describe('PATCH /api/settings', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await PATCH(new Request('http://test', { method: 'PATCH', body: JSON.stringify({ showBib: true }) }))
    expect(res.status).toBe(401)
  })

  it('upserts setting when showBib provided', async () => {
    mock.queueResult({ data: null, error: null })
    mock.queueResult({ data: { value: 'false' }, error: null })
    await PATCH(new Request('http://test', { method: 'PATCH', body: JSON.stringify({ slug: 'test', showBib: false }) }))

    const upsertCall = mock.calls[0]
    expect(upsertCall.table).toBe('Setting')
    const upsert = upsertCall.ops.find(o => o.op === 'upsert')!
    expect(upsert.args[0]).toMatchObject({ key: 'showBib', value: 'false' })
    expect(upsert.args[1]).toMatchObject({ onConflict: 'competitionId,key' })
  })
})
