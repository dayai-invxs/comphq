import { describe, it, expect } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { GET } from './route'

describe('GET /api/health', () => {
  it('returns 200 + ok when DB reachable', async () => {
    mock.queueResult({ data: [{ id: 1 }], error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(res.headers.get('cache-control')).toMatch(/no-store/)
  })

  it('returns 503 + error when DB probe fails', async () => {
    mock.queueResult({ data: null, error: { message: 'connection refused' } })
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('error')
    expect(body.message).toMatch(/connection refused/)
  })
})
