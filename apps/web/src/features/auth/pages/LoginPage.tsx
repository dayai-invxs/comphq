import { useState } from 'react'
import { Button, Field, Input, Link, PasswordInput, Stack, Text } from '@mond-design-system/react'
import { useNavigate, useSearchParams } from 'react-router'
import { RouterAnchor } from '@/components/RouterAnchor'
import { getSupabaseClient } from '@/lib/supabase'
import { AuthCard } from '../components/AuthCard/AuthCard'

// v1: src/app/login/page.tsx. Two things it did that a SPA does not need are
// gone rather than translated — the Suspense boundary was there because Next's
// useSearchParams suspends, and router.refresh() re-ran a server render. Here
// SessionProvider's onAuthStateChange is what tells the app the user changed.
export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Only accept same-origin callback URLs to prevent open redirects.
  const rawCallback = params.get('callbackUrl') ?? '/admin'
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
    navigate(callbackUrl)
  }

  return (
    <AuthCard title="Admin Login">
      <form onSubmit={(e) => { e.preventDefault(); void handleSubmit() }}>
        <Stack gap="base">
          <Field label="Email">
            <Input
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              name="password"
              autoComplete="current-password"
              showLabel="Show password"
              hideLabel="Hide password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {/* A refused sign-in that is only a colour is a sign-in nobody
              hears about. The rest of the app reports a refusal this way. */}
          {error && <Text role="alert" variant="meta" tone="danger">{error}</Text>}
          <Button type="submit" fullWidth loading={loading}>Sign In</Button>
          <Text variant="meta" align="center">
            <Link as={RouterAnchor} href="/forgot-password">Forgot password?</Link>
          </Text>
        </Stack>
      </form>
    </AuthCard>
  )
}
