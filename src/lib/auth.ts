import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

async function ensureSeedUser() {
  const count = await prisma.user.count()
  if (count === 0) {
    const username = process.env.ADMIN_USERNAME ?? 'admin'
    const plainPassword = process.env.ADMIN_PASSWORD ?? 'crossfit123'
    const password = await bcrypt.hash(plainPassword, 10)
    await prisma.user.create({ data: { username, password } })
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
        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        })
        if (!user) return null
        const valid = await bcrypt.compare(credentials.password, user.password)
        if (!valid) return null
        return { id: String(user.id), name: user.username }
      },
    }),
  ],
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
}
