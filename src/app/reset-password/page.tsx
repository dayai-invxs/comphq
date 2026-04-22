'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase-client'
import { ComphqLogo } from '@/components/ComphqLogo'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'checking' | 'ready' | 'saving' | 'done'>('checking')

  useEffect(() => {
    const supabase = getSupabaseClient()
    const code = new URLSearchParams(window.location.search).get('code')

    if (code) {
      // PKCE flow: Supabase landed here with ?code= — exchange it for a session.
      void supabase.auth.exchangeCodeForSession(code).then(({ error: err }) => {
        if (err) setError('Reset link is invalid or expired.')
        setStatus('ready')
        // Remove the code from the URL so a refresh doesn't re-attempt the exchange.
        window.history.replaceState({}, '', '/reset-password')
      })
    } else {
      // Fallback: arrived via /auth/callback which already exchanged the code.
      void supabase.auth.getUser().then(({ data, error: err }) => {
        if (err || !data.user) setError('Reset link is invalid or expired.')
        setStatus('ready')
      })
    }
  }, [])

  async function handleSubmit() {
    setError('')
    if (password.length < 12) { setError('Password must be at least 12 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setStatus('saving')
    const supabase = getSupabaseClient()
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError(err.message)
      setStatus('ready')
      return
    }
    setStatus('done')
    setTimeout(() => router.push('/admin'), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div style={{ width: 240, height: 240 }}>
            <ComphqLogo />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Set New Password</h1>
        <p className="text-gray-400 text-sm mb-6">Choose a new password (at least 12 characters).</p>

        {status === 'done' ? (
          <div className="space-y-4">
            <p className="text-green-400 text-sm">Password updated. Redirecting…</p>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm text-gray-400 mb-1">New Password</label>
              <input
                id="password" name="password" type="password" autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
            <div>
              <label htmlFor="confirm" className="block text-sm text-gray-400 mb-1">Confirm Password</label>
              <input
                id="confirm" name="confirm" type="password" autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={status !== 'ready'}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors"
            >
              {status === 'saving' ? 'Saving…' : 'Set New Password'}
            </button>
            <div className="text-center">
              <Link href="/login" className="text-sm text-gray-400 hover:text-orange-400 transition-colors">
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
