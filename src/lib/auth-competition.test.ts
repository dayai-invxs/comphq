import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'

// These tests exercise the real helpers. setup.ts mocks the module's public
// API so routes get predictable stubs; unmock to pull the real code for
// these unit tests.
vi.unmock('@/lib/auth-competition')

const {
  AuthError,
  authErrorResponse,
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
    mock.queueResult({ data: { isSuper: true }, error: null })
    const user = await requireSession()
    expect(user).toMatchObject({ id: 'user-1', email: 'admin@test.local', isSuper: true })
  })

  it('defaults isSuper to false when no UserProfile row exists', async () => {
    setAuthUser({ id: 'user-2', email: 'new@test.local' })
    mock.queueResult({ data: null, error: null })
    const user = await requireSession()
    expect(user.isSuper).toBe(false)
  })

  it('defaults isSuper to false when column is false', async () => {
    setAuthUser({ id: 'user-3', email: 'member@test.local' })
    mock.queueResult({ data: { isSuper: false }, error: null })
    const user = await requireSession()
    expect(user.isSuper).toBe(false)
  })
})

describe('requireCompetitionAdmin', () => {
  it('throws 401 when no Supabase session', async () => {
    setAuthUser(null)
    await expect(requireCompetitionAdmin('default')).rejects.toMatchObject({ status: 401 })
  })

  it('throws 404 when the slug resolves to no competition', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult({ data: { isSuper: true }, error: null }) // UserProfile
    // resolveCompetition is mocked to return null for empty slug (see setup.ts)
    await expect(requireCompetitionAdmin('')).rejects.toMatchObject({ status: 404 })
  })

  it('super admin bypasses the CompetitionAdmin row check', async () => {
    setAuthUser({ id: 'super-1', email: 'super@test.local' })
    mock.queueResult({ data: { isSuper: true }, error: null }) // UserProfile
    // NO CompetitionAdmin lookup should occur — super admins bypass it.
    const ctx = await requireCompetitionAdmin('default')
    expect(ctx.user.isSuper).toBe(true)
    expect(ctx.competition.slug).toBe('default')
  })

  it('non-super admin with CompetitionAdmin row is accepted', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult({ data: { isSuper: false }, error: null }) // UserProfile
    mock.queueResult({ data: { userId: 'user-1', competitionId: 1 }, error: null }) // CompetitionAdmin
    const ctx = await requireCompetitionAdmin('default')
    expect(ctx.user.isSuper).toBe(false)
    expect(ctx.competition.slug).toBe('default')
  })

  it('non-super, non-admin is rejected with 403', async () => {
    setAuthUser({ id: 'stranger', email: 'stranger@test.local' })
    mock.queueResult({ data: { isSuper: false }, error: null })
    mock.queueResult({ data: null, error: null })
    await expect(requireCompetitionAdmin('default')).rejects.toMatchObject({ status: 403 })
  })
})

describe('requireSiteAdmin', () => {
  it('returns the user for site admins (isSuper=true)', async () => {
    setAuthUser({ id: 'super-1', email: 'super@test.local' })
    mock.queueResult({ data: { isSuper: true }, error: null })
    await expect(requireSiteAdmin()).resolves.toMatchObject({ isSuper: true })
  })

  it('throws 403 for non-super users', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult({ data: { isSuper: false }, error: null })
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
