import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { sql } from '@/lib/db'

async function ensureSeedUser() {
  const [{ count }] = await sql<[{ count: string }]>`SELECT count(*)::text FROM "User"`
  if (Number(count) === 0) {
    const username = process.env.ADMIN_USERNAME ?? 'admin'
    const plainPassword = process.env.ADMIN_PASSWORD ?? 'crossfit123'
    const password = await bcrypt.hash(plainPassword, 10)
    await sql`INSERT INTO "User" (username, password) VALUES (${username}, ${password})`
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
        const [user] = await sql`SELECT * FROM "User" WHERE username = ${credentials.username}`
        if (!user) return null
        const valid = await bcrypt.compare(credentials.password, user.password as string)
        if (!valid) return null
        return { id: String(user.id), name: user.username as string }
      },
    }),
  ],
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
}
