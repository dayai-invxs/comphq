'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase-client'
import { ComphqLogo } from '@/components/ComphqLogo'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

  useEffect(() => {
    const supabase = getSupabaseClient()
    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setStatus(data.user ? 'authenticated' : 'unauthenticated')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setStatus(session?.user ? 'authenticated' : 'unauthenticated')
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') router.push(`/login?callbackUrl=${encodeURIComponent('/admin')}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  async function signOut() {
    await getSupabaseClient().auth.signOut()
    router.push('/login')
  }

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>
  }

  if (!user) return null

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8"><ComphqLogo /></div>
            <span className="text-orange-400 font-bold text-lg">comphq</span>
          </div>
          <button
            onClick={signOut}
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
