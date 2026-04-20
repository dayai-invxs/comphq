import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { supabase } from '@/lib/supabase'

async function ensureSeedUser() {
  const { data } = await supabase.from('User').select('id').limit(1)
  if (!data || data.length === 0) {
    const username = process.env.ADMIN_USERNAME ?? 'admin'
    const plainPassword = process.env.ADMIN_PASSWORD ?? 'crossfit123'
    const password = await bcrypt.hash(plainPassword, 10)
    await supabase.from('User').insert({ username, password })
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null
        await ensureSeedUser()
        const { data: user } = await supabase
          .from('User')
          .select('*')
          .eq('username', credentials.username)
          .maybeSingle()
        if (!user) return null
        const valid = await bcrypt.compare(credentials.password, (user as { password: string }).password)
        if (!valid) return null
        return { id: String((user as { id: number }).id), name: (user as { username: string }).username }
      },
    }),
  ],
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
}
