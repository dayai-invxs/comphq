import { vi, beforeEach } from 'vitest'
import { createSupabaseMock } from './supabase-mock'

process.env.SUPABASE_URL ??= 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key'
process.env.NEXTAUTH_SECRET ??= 'test-secret'

export const supabaseMock = createSupabaseMock()

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock.client }))

vi.mock('@/lib/competition', () => ({
  resolveCompetition: vi.fn().mockResolvedValue({ id: 1, name: 'Test', slug: 'test' }),
  getCompetitionSlug: vi.fn().mockResolvedValue('test'),
}))

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

beforeEach(async () => {
  supabaseMock.reset()
  const { getServerSession } = await import('next-auth')
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: 'admin' } } as never)
})
