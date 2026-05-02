import { describe, it, expect, vi } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'

// These tests exercise the real helpers. setup.ts mocks the module's public
// API so routes get predictable stubs; unmock to pull the real code.
vi.unmock('@/lib/auth-competition')

const {
  AuthError,
  authErrorResponse,
  requireCompetitionAccess,
  requireCompetitionAdmin,
  requireSession,
  requireSiteAdmin,
} = await vi.importActual<typeof import('./auth-competition')>('./auth-competition')

describe('requireSession', () => {
  it('throws 401 when no Supabase session', async () => {
    setAuthUser(null)
    await expect(requireSession()).rejects.toMatchObject({ status: 401 })
  })

  it('returns { id, email, isSuper } when UserProfile.isSuper is true', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult([{ isSuper: true }])
    const user = await requireSession()
    expect(user).toMatchObject({ id: 'user-1', email: 'admin@test.local', isSuper: true })
  })

  it('defaults isSuper to false when no UserProfile row exists', async () => {
    setAuthUser({ id: 'user-2', email: 'new@test.local' })
    mock.queueResult([])
    const user = await requireSession()
    expect(user.isSuper).toBe(false)
  })

  it('defaults isSuper to false when column is false', async () => {
    setAuthUser({ id: 'user-3', email: 'member@test.local' })
    mock.queueResult([{ isSuper: false }])
    const user = await requireSession()
    expect(user.isSuper).toBe(false)
  })
})

describe('requireCompetitionAccess', () => {
  it('throws 401 when no Supabase session', async () => {
    setAuthUser(null)
    await expect(requireCompetitionAccess('default')).rejects.toMatchObject({ status: 401 })
  })

  it('throws 404 when the slug resolves to no competition', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult([{ isSuper: true }])
    await expect(requireCompetitionAccess('')).rejects.toMatchObject({ status: 404 })
  })

  it('super admin bypasses the membership row check', async () => {
    setAuthUser({ id: 'super-1', email: 'super@test.local' })
    mock.queueResult([{ isSuper: true }])
    const ctx = await requireCompetitionAccess('default')
    expect(ctx.user.isSuper).toBe(true)
    expect(ctx.membership.role).toBe('admin')
    expect(ctx.competition.slug).toBe('default')
  })

  it('accepts a competition admin (role=admin)', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult([{ isSuper: false }])
    mock.queueResult([{ userId: 'user-1', competitionId: 1, role: 'admin' }])
    const ctx = await requireCompetitionAccess('default')
    expect(ctx.membership.role).toBe('admin')
  })

  it('accepts a competition user (role=user)', async () => {
    setAuthUser({ id: 'user-2', email: 'user@test.local' })
    mock.queueResult([{ isSuper: false }])
    mock.queueResult([{ userId: 'user-2', competitionId: 1, role: 'user' }])
    const ctx = await requireCompetitionAccess('default')
    expect(ctx.membership.role).toBe('user')
  })

  it('rejects a user with no membership row (403)', async () => {
    setAuthUser({ id: 'stranger', email: 'stranger@test.local' })
    mock.queueResult([{ isSuper: false }])
    mock.queueResult([])
    await expect(requireCompetitionAccess('default')).rejects.toMatchObject({ status: 403 })
  })
})

describe('requireCompetitionAdmin', () => {
  it('throws 401 when no Supabase session', async () => {
    setAuthUser(null)
    await expect(requireCompetitionAdmin('default')).rejects.toMatchObject({ status: 401 })
  })

  it('throws 404 when the slug resolves to no competition', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult([{ isSuper: true }])
    await expect(requireCompetitionAdmin('')).rejects.toMatchObject({ status: 404 })
  })

  it('super admin bypasses the CompetitionAdmin row check', async () => {
    setAuthUser({ id: 'super-1', email: 'super@test.local' })
    mock.queueResult([{ isSuper: true }])
    const ctx = await requireCompetitionAdmin('default')
    expect(ctx.user.isSuper).toBe(true)
    expect(ctx.competition.slug).toBe('default')
  })

  it('competition admin (role=admin) is accepted', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult([{ isSuper: false }])
    mock.queueResult([{ userId: 'user-1', competitionId: 1, role: 'admin' }])
    const ctx = await requireCompetitionAdmin('default')
    expect(ctx.membership.role).toBe('admin')
  })

  it('competition user (role=user) is rejected with 403', async () => {
    setAuthUser({ id: 'user-2', email: 'user@test.local' })
    mock.queueResult([{ isSuper: false }])
    mock.queueResult([{ userId: 'user-2', competitionId: 1, role: 'user' }])
    await expect(requireCompetitionAdmin('default')).rejects.toMatchObject({ status: 403 })
  })

  it('non-member is rejected with 403', async () => {
    setAuthUser({ id: 'stranger', email: 'stranger@test.local' })
    mock.queueResult([{ isSuper: false }])
    mock.queueResult([])
    await expect(requireCompetitionAdmin('default')).rejects.toMatchObject({ status: 403 })
  })
})

describe('requireSiteAdmin', () => {
  it('returns the user for site admins (isSuper=true)', async () => {
    setAuthUser({ id: 'super-1', email: 'super@test.local' })
    mock.queueResult([{ isSuper: true }])
    await expect(requireSiteAdmin()).resolves.toMatchObject({ isSuper: true })
  })

  it('throws 403 for non-super users', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult([{ isSuper: false }])
    await expect(requireSiteAdmin()).rejects.toMatchObject({ status: 403 })
  })

  it('throws 401 when unauthenticated', async () => {
    setAuthUser(null)
    await expect(requireSiteAdmin()).rejects.toMatchObject({ status: 401 })
  })
})

describe('authErrorResponse', () => {
  it('converts AuthError to a Response with matching status', async () => {
    const res = authErrorResponse(new AuthError(403, 'nope'))
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('nope')
  })

  it('rethrows unknown errors', () => {
    expect(() => authErrorResponse(new Error('boom'))).toThrow(/boom/)
  })
})
