import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'

// Pre-computed bcrypt hash used to equalize the login timing when the
// supplied username doesn't exist. Any fixed valid bcrypt hash works —
// the specific input doesn't matter, only that compare() takes ~equal time.
const DUMMY_HASH = '$2b$10$Y.XeuWySHr9rhCP3XN0rS.ZVxJyHGXvXjd3JFB/uCEh3ESEL2TXR6'

export async function ensureSeedUser(): Promise<void> {
  const { data } = await supabase.from('User').select('id').limit(1)
  if (data && data.length > 0) return

  // Empty table → we're about to seed the first admin.
  const isProd = process.env.NODE_ENV === 'production'
  const adminPassword = process.env.ADMIN_PASSWORD ?? env.ADMIN_PASSWORD

  if (isProd && !adminPassword) {
    throw new Error(
      'ADMIN_PASSWORD env is required to seed the first user in production (no hardcoded fallback).',
    )
  }

  const username = process.env.ADMIN_USERNAME ?? env.ADMIN_USERNAME ?? 'admin'
  const plainPassword = adminPassword ?? 'crossfit123' // dev-only fallback
  const password = await bcrypt.hash(plainPassword, 10)

  await supabase.from('User').insert({ username, password })
}

type Credentials = { username?: string; password?: string } | undefined

export async function authorize(credentials: Credentials): Promise<{ id: string; name: string } | null> {
  if (!credentials?.username || !credentials?.password) {
    // Equalize timing with the bcrypt path even when creds are missing.
    await bcrypt.compare('placeholder', DUMMY_HASH)
    return null
  }

  await ensureSeedUser()

  const { data: user } = await supabase
    .from('User')
    .select('*')
    .eq('username', credentials.username)
    .maybeSingle()

  // Always run bcrypt.compare — against the real hash if user exists, against
  // DUMMY_HASH if not — so response time doesn't leak user existence.
  const hash = user ? (user as { password: string }).password : DUMMY_HASH
  const ok = await bcrypt.compare(credentials.password, hash)

  if (!user || !ok) return null
  return { id: String((user as { id: number }).id), name: (user as { username: string }).username }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      authorize,
    }),
  ],
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 }, // 8h
  secret: env.NEXTAUTH_SECRET,
}
