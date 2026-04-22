import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser, setAuthSuper } from '@/test/setup'
import { POST } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function req() {
  return new Request('http://test/api/users/abc/reset-password', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000' },
  })
}

describe('POST /api/users/[id]/reset-password', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await POST(req(), params('abc'))
    expect(res.status).toBe(401)
  })

  it('rejects non-super', async () => {
    setAuthSuper(false)
    const res = await POST(req(), params('abc'))
    expect(res.status).toBe(403)
  })

  it('returns 404 when the target user is not found', async () => {
    // Auth admin returns no user (or data.user = null). Our route treats this as 404.
    mock.queueResult({ data: { users: [] }, error: null })
    const res = await POST(req(), params('missing-uuid'))
    expect(res.status).toBe(404)
  })

  it('triggers resetPasswordForEmail for the target user', async () => {
    // listUsers → one matching user
    mock.queueResult({
      data: { users: [{ id: 'target-uuid', email: 'target@t.local' }] },
      error: null,
    })
    // resetPasswordForEmail → success
    mock.queueResult({ data: null, error: null })

    const res = await POST(req(), params('target-uuid'))
    expect(res.status).toBe(200)

    const call = mock.calls.find((c) => c.table === 'auth:resetPasswordForEmail')
    expect(call).toBeTruthy()
    expect(call!.ops[0].args[0]).toBe('target@t.local')
  })
})
