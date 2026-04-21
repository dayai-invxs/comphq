'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ComphqLogo } from '@/components/ComphqLogo'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>
  }

  if (!session) return null

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8"><ComphqLogo /></div>
            <span className="text-orange-400 font-bold text-lg">comphq</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">{children}</main>
    </div>
  )
}
