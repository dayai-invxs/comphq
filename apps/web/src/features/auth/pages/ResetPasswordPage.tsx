import { useEffect, useState } from 'react'
import { Button, Field, Link, PasswordInput, Stack, Text } from '@mond-design-system/react'
import { useNavigate, useSearchParams } from 'react-router'
import { RouterAnchor } from '@/components/RouterAnchor'
import { getSupabaseClient } from '@/lib/supabase'
import { AuthCard } from '../components/AuthCard/AuthCard'

// v1: src/app/reset-password/page.tsx. v1 read window.location and wrote it
// back with history.replaceState; here the router owns the address bar, so the
// same two moves go through useSearchParams and a replacing navigate.
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const code = params.get('code')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'checking' | 'ready' | 'saving' | 'done'>('checking')

  useEffect(() => {
    const supabase = getSupabaseClient()

    if (code) {
      // PKCE flow: Supabase landed here with ?code= — exchange it for a session.
      void supabase.auth.exchangeCodeForSession(code).then(({ error: err }) => {
        if (err) setError('Reset link is invalid or expired.')
        setStatus('ready')
        // Remove the code from the URL so a refresh doesn't re-attempt the exchange.
        navigate('/reset-password', { replace: true })
      })
    } else {
      // Fallback: arrived via /auth/callback which already exchanged the code.
      void supabase.auth.getUser().then(({ data, error: err }) => {
        if (err || !data.user) setError('Reset link is invalid or expired.')
        setStatus('ready')
      })
    }
    // The code is read once, at mount: stripping it from the URL must not
    // re-run the exchange it was just spent on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setTimeout(() => navigate('/admin'), 1500)
  }

  return (
    <AuthCard title="Set New Password" description="Choose a new password (at least 12 characters).">
      {status === 'done' ? (
        <Text role="status" variant="meta" tone="success">Password updated. Redirecting…</Text>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void handleSubmit() }}>
          <Stack gap="base">
            <Field label="New Password">
              <PasswordInput
                name="password"
                autoComplete="new-password"
                showLabel="Show password"
                hideLabel="Hide password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="Confirm Password">
              <PasswordInput
                name="confirm"
                autoComplete="new-password"
                showLabel="Show password"
                hideLabel="Hide password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>
            {error && <Text role="alert" variant="meta" tone="danger">{error}</Text>}
            {/* The button below sits disabled until the link is verified; this
                says why, rather than the form looking broken for the length of
                the round trip. */}
            {status === 'checking' && (
              <Text role="status" variant="meta" tone="muted">Checking the reset link…</Text>
            )}
            <Button
              type="submit"
              fullWidth
              loading={status === 'saving'}
              disabled={status !== 'ready'}
            >
              Set New Password
            </Button>
            <Text variant="meta" align="center">
              <Link as={RouterAnchor} href="/login">Back to sign in</Link>
            </Text>
          </Stack>
        </form>
      )}
    </AuthCard>
  )
}
