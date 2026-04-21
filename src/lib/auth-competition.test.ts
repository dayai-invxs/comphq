import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import {
  AuthError,
  authErrorResponse,
  requireCompetitionMember,
  requireSession,
  requireSiteAdmin,
} from './auth-competition'
import type { Session } from 'next-auth'

const adminSession = { user: { name: 'admin' } } as Session
const userSession = { user: { name: 'bob' } } as Session

describe('requireSession', () => {
  it('throws 401 on null session', async () => {
    await expect(requireSession(null)).rejects.toMatchObject({ status: 401 })
  })

  it('returns the user when session + DB row match', async () => {
    mock.queueResult({ data: { id: 1, username: 'admin', role: 'admin' }, error: null })
    const user = await requireSession(adminSession)
    expect(user).toMatchObject({ id: 1, username: 'admin', role: 'admin' })
  })

  it('throws 401 when session references an unknown user', async () => {
    mock.queueResult({ data: null, error: null })
    await expect(requireSession(adminSession)).rejects.toMatchObject({ status: 401 })
  })
})

describe('requireCompetitionMember', () => {
  it('throws 404 when slug resolves to no competition', async () => {
    mock.queueResult({ data: { id: 1, username: 'admin', role: 'admin' }, error: null })
    // resolveCompetition is mocked to return null for empty slug
    await expect(requireCompetitionMember(adminSession, '')).rejects.toMatchObject({ status: 404 })
  })

  it('throws 403 when the user is not a member', async () => {
    mock.queueResult({ data: { id: 2, username: 'bob', role: 'admin' }, error: null }) // user lookup
    mock.queueResult({ data: null, error: null })                                       // membership lookup
    await expect(requireCompetitionMember(userSession, 'default')).rejects.toMatchObject({ status: 403 })
  })

  it('returns context for a member', async () => {
    mock.queueResult({ data: { id: 1, username: 'admin', role: 'admin' }, error: null })
    mock.queueResult({ data: { userId: 1, competitionId: 1, role: 'admin' }, error: null })

    const ctx = await requireCompetitionMember(adminSession, 'default')
    expect(ctx.competition.slug).toBe('default')
    expect(ctx.membership.role).toBe('admin')
    expect(ctx.user.username).toBe('admin')
  })

  it('rejects scorekeeper when minRole=admin', async () => {
    mock.queueResult({ data: { id: 1, username: 'sk', role: 'admin' }, error: null })
    mock.queueResult({ data: { userId: 1, competitionId: 1, role: 'scorekeeper' }, error: null })

    await expect(requireCompetitionMember(adminSession, 'default', 'admin')).rejects.toMatchObject({ status: 403 })
  })

  it('accepts admin when minRole=admin', async () => {
    mock.queueResult({ data: { id: 1, username: 'admin', role: 'admin' }, error: null })
    mock.queueResult({ data: { userId: 1, competitionId: 1, role: 'admin' }, error: null })
    await expect(requireCompetitionMember(adminSession, 'default', 'admin')).resolves.toMatchObject({
      membership: { role: 'admin' },
    })
  })
})

describe('requireSiteAdmin', () => {
  it('returns the user for site admins', async () => {
    mock.queueResult({ data: { id: 1, username: 'admin', role: 'admin' }, error: null })
    await expect(requireSiteAdmin(adminSession)).resolves.toMatchObject({ role: 'admin' })
  })

  it('throws 403 for non-admin site roles', async () => {
    mock.queueResult({ data: { id: 1, username: 'bob', role: 'user' }, error: null })
    await expect(requireSiteAdmin(userSession)).rejects.toMatchObject({ status: 403 })
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

describe('integration: mocked resolveCompetition', () => {
  it('uses the mocked resolveCompetition from setup.ts', async () => {
    const { resolveCompetition } = await import('./competition')
    expect(resolveCompetition).toBeDefined()
    expect(vi.isMockFunction(resolveCompetition)).toBe(true)
  })
})
