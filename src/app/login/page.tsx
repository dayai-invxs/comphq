'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase-client'
import { ComphqLogo } from '@/components/ComphqLogo'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Only accept same-origin callback URLs to prevent open redirects.
  const rawCallback = searchParams.get('callbackUrl') ?? '/admin'
  const callbackUrl = rawCallback.startsWith('/') ? rawCallback : '/admin'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    setError('')
    const supabase = getSupabaseClient()
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authErr) {
      setError('Invalid email or password')
      return
    }
    router.push(callbackUrl)
    router.refresh()
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm text-gray-400 mb-1">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm text-gray-400 mb-1">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
          required
        />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors"
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
      <div className="text-center">
        <Link href="/forgot-password" className="text-sm text-gray-400 hover:text-orange-400 transition-colors">
          Forgot password?
        </Link>
      </div>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div style={{ width: 240, height: 240 }}>
            <ComphqLogo />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-6">Admin Login</h1>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
