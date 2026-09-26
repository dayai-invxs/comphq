import { describe, it, expect } from 'vitest'
import { setAuthUser, setAuthSuper } from '@/test/setup'
import { GET } from './route'

describe('GET /api/me', () => {
  it('returns 401 when no session', async () => {
    setAuthUser(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns { id, email, isSuper: true } for a super admin', async () => {
    setAuthUser({ id: 'super-uuid', email: 'super@t.local' })
    setAuthSuper(true)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'super-uuid', email: 'super@t.local', isSuper: true })
  })

  it('returns { isSuper: false } for a non-super admin', async () => {
    setAuthUser({ id: 'member-uuid', email: 'member@t.local' })
    setAuthSuper(false)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.isSuper).toBe(false)
    expect(body.email).toBe('member@t.local')
  })
})
