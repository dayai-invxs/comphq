import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { GET, PATCH } from './route'

const getReq = () => new Request('http://test/api/settings?slug=default')
const patchReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/settings', {
    method: 'PATCH',
    body: JSON.stringify({ slug: 'default', ...body }),
  })

describe('GET /api/settings', () => {
  it('returns showBib=true by default', async () => {
    mock.queueResults(
      { data: null, error: null },
      { data: null, error: null },
    )
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.showBib).toBe(true)
  })

  it('returns showBib=false when stored as false', async () => {
    mock.queueResults(
      { data: { value: 'false' }, error: null },
      { data: null, error: null },
    )
    const res = await GET(getReq())
    const body = await res.json()
    expect(body.showBib).toBe(false)
  })
})

describe('PATCH /api/settings', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await PATCH(patchReq({ showBib: true }))
    expect(res.status).toBe(401)
  })

  it('upserts setting when showBib provided', async () => {
    mock.queueResult({ data: null, error: null })
    mock.queueResult({ data: { value: 'false' }, error: null })
    mock.queueResult({ data: null, error: null })
    await PATCH(patchReq({ showBib: false }))

    const upsertCall = mock.calls.find((c) => c.table === 'Setting' && c.ops.some((o) => o.op === 'upsert'))!
    expect(upsertCall).toBeDefined()
    const upsert = upsertCall.ops.find(o => o.op === 'upsert')!
    expect((upsert.args[0] as { key: string }).key).toBe('showBib')
    expect((upsert.args[0] as { value: string }).value).toBe('false')
    expect(upsert.args[1]).toMatchObject({ onConflict: 'competitionId,key' })
  })
})
