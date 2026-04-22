import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'

// These tests exercise the real helpers. setup.ts mocks the module's public
// API so routes get predictable stubs; unmock to pull the real code for
// these unit tests.
vi.unmock('@/lib/auth-competition')

const {
  AuthError,
  authErrorResponse,
  requireCompetitionMember,
  requireSession,
  requireSiteAdmin,
} = await vi.importActual<typeof import('./auth-competition')>('./auth-competition')

describe('requireSession', () => {
  it('throws 401 when no Supabase session', async () => {
    setAuthUser(null)
    await expect(requireSession()).rejects.toMatchObject({ status: 401 })
  })

  it('returns the user + role from UserProfile when session is valid', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult({ data: { role: 'admin' }, error: null })
    const user = await requireSession()
    expect(user).toMatchObject({ id: 'user-1', email: 'admin@test.local', role: 'admin' })
  })

  it('defaults role to "user" when no UserProfile row exists yet', async () => {
    setAuthUser({ id: 'user-2', email: 'new@test.local' })
    mock.queueResult({ data: null, error: null })
    const user = await requireSession()
    expect(user.role).toBe('user')
  })
})

describe('requireCompetitionMember', () => {
  it('throws 401 when no Supabase session', async () => {
    setAuthUser(null)
    await expect(requireCompetitionMember('default')).rejects.toMatchObject({ status: 401 })
  })

  it('throws 404 when the slug resolves to no competition', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult({ data: { role: 'admin' }, error: null }) // UserProfile
    // resolveCompetition is mocked to return null for empty slug (see setup.ts)
    await expect(requireCompetitionMember('')).rejects.toMatchObject({ status: 404 })
  })

  it('throws 403 when the user is not a member of the competition', async () => {
    setAuthUser({ id: 'user-2', email: 'bob@test.local' })
    mock.queueResult({ data: { role: 'user' }, error: null })         // UserProfile
    mock.queueResult({ data: null, error: null })                     // CompetitionMember lookup (none)
    await expect(requireCompetitionMember('default')).rejects.toMatchObject({ status: 403 })
  })

  it('returns the auth context for a valid member', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult({ data: { role: 'admin' }, error: null })
    mock.queueResult({ data: { userId: 'user-1', competitionId: 1, role: 'admin' }, error: null })

    const ctx = await requireCompetitionMember('default')
    expect(ctx.competition.slug).toBe('default')
    expect(ctx.membership.role).toBe('admin')
    expect(ctx.user.email).toBe('admin@test.local')
  })

  it('rejects scorekeeper role when minRole=admin', async () => {
    setAuthUser({ id: 'user-3', email: 'sk@test.local' })
    mock.queueResult({ data: { role: 'user' }, error: null })
    mock.queueResult({ data: { userId: 'user-3', competitionId: 1, role: 'scorekeeper' }, error: null })

    await expect(requireCompetitionMember('default', 'admin')).rejects.toMatchObject({ status: 403 })
  })

  it('accepts admin membership when minRole=admin', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult({ data: { role: 'admin' }, error: null })
    mock.queueResult({ data: { userId: 'user-1', competitionId: 1, role: 'admin' }, error: null })

    await expect(requireCompetitionMember('default', 'admin')).resolves.toMatchObject({
      membership: { role: 'admin' },
    })
  })
})

describe('requireSiteAdmin', () => {
  it('returns the user for site admins', async () => {
    setAuthUser({ id: 'user-1', email: 'admin@test.local' })
    mock.queueResult({ data: { role: 'admin' }, error: null })
    await expect(requireSiteAdmin()).resolves.toMatchObject({ role: 'admin' })
  })

  it('throws 403 for non-admin site roles', async () => {
    setAuthUser({ id: 'user-2', email: 'bob@test.local' })
    mock.queueResult({ data: { role: 'user' }, error: null })
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
