import { vi, beforeEach } from 'vitest'
import { createSupabaseMock } from './supabase-mock'

process.env.SUPABASE_URL ??= 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'

export const supabaseMock = createSupabaseMock()

// Simulated Supabase Auth state. Tests call setAuthUser(...) to flip between
// "logged in as X" and "no session." Defaults to a logged-in super admin so
// existing route tests keep working.
type AuthUserShape = { id: string; email: string | null } | null
let authUser: AuthUserShape = { id: 'user-1', email: 'admin@test.local' }
let authIsSuper = true
export function setAuthUser(u: AuthUserShape) { authUser = u; authIsSuper = true }
export function setAuthSuper(isSuper: boolean) { authIsSuper = isSuper }

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock.client }))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: authUser },
        error: authUser ? null : { message: 'No user', status: 401 },
      })),
    },
  })),
}))

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
    requireSession: vi.fn(async () => {
      if (!authUser) throw new actual.AuthError(401, 'Unauthorized')
      return { id: authUser.id, email: authUser.email, isSuper: authIsSuper }
    }),
    requireCompetitionAdmin: vi.fn(async (slug: string) => {
      if (!authUser) throw new actual.AuthError(401, 'Unauthorized')
      if (!slug) throw new actual.AuthError(404, 'Competition not found')
      return {
        user: { id: authUser.id, email: authUser.email, isSuper: authIsSuper },
        membership: { userId: authUser.id, competitionId: 1 },
        competition: { id: 1, name: 'Default', slug },
      }
    }),
    requireSiteAdmin: vi.fn(async () => {
      if (!authUser) throw new actual.AuthError(401, 'Unauthorized')
      if (!authIsSuper) throw new actual.AuthError(403, 'Super-admin required')
      return { id: authUser.id, email: authUser.email, isSuper: true }
    }),
  }
})

beforeEach(() => {
  supabaseMock.reset()
  // Default: logged-in admin. Tests that need the unauthed case call setAuthUser(null).
  setAuthUser({ id: 'user-1', email: 'admin@test.local' })
})
