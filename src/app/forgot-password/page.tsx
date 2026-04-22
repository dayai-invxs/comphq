'use client'

import { useState } from 'react'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase-client'
import { ComphqLogo } from '@/components/ComphqLogo'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit() {
    setStatus('sending')
    setError('')
    const supabase = getSupabaseClient()
    const redirectTo = `${window.location.origin}/reset-password`
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (err) {
      setStatus('error')
      setError(err.message)
    } else {
      setStatus('sent')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div style={{ width: 240, height: 240 }}>
            <ComphqLogo />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Reset Password</h1>
        <p className="text-gray-400 text-sm mb-6">
          Enter the email address on your admin account and we&apos;ll send you a reset link.
        </p>

        {status === 'sent' ? (
          <div className="space-y-4">
            <p className="text-green-400 text-sm">
              Check your inbox. If an account exists for <span className="text-white font-medium">{email}</span>,
              you&apos;ll receive a reset link shortly.
            </p>
            <Link href="/login" className="block text-center text-sm text-gray-400 hover:text-orange-400 transition-colors">
              Back to sign in
            </Link>
          </div>
        ) : (
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
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors"
            >
              {status === 'sending' ? 'Sending…' : 'Send Reset Link'}
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
