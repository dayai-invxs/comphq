import { vi, beforeEach } from 'vitest'
import { createSupabaseMock } from './supabase-mock'

process.env.SUPABASE_URL ??= 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key'
process.env.NEXTAUTH_SECRET ??= 'test-secret'

export const supabaseMock = createSupabaseMock()

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock.client }))

vi.mock('@/lib/competition', () => ({
  resolveCompetition: vi.fn(async (slug?: string) => {
    if (!slug) return null
    return { id: 1, name: 'Default', slug }
  }),
  getCompetitionSlug: vi.fn(async () => 'default'),
}))

vi.mock('@/lib/auth-competition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth-competition')>()
  return {
    ...actual,
    requireSession: vi.fn(async (session) => {
      if (!session?.user?.name) throw new actual.AuthError(401, 'Unauthorized')
      return { id: 1, username: session.user.name, role: 'admin' }
    }),
    requireCompetitionMember: vi.fn(async (session, slug, minRole = 'scorekeeper') => {
      if (!session?.user?.name) throw new actual.AuthError(401, 'Unauthorized')
      if (!slug) throw new actual.AuthError(404, 'Competition not found')
      return {
        user: { id: 1, username: session.user.name, role: 'admin' as const },
        membership: { userId: 1, competitionId: 1, role: minRole === 'admin' ? ('admin' as const) : ('admin' as const) },
        competition: { id: 1, name: 'Default', slug },
      }
    }),
    requireSiteAdmin: vi.fn(async (session) => {
      if (!session?.user?.name) throw new actual.AuthError(401, 'Unauthorized')
      return { id: 1, username: session.user.name, role: 'admin' as const }
    }),
  }
})

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

beforeEach(async () => {
  supabaseMock.reset()
  const { getServerSession } = await import('next-auth')
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: 'admin' } } as never)
})
