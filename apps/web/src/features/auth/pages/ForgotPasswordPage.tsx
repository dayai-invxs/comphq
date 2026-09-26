import { useState } from 'react'
import { Button, Field, Input, Link, Stack, Text } from '@mond-design-system/react'
import { RouterAnchor } from '@/components/RouterAnchor'
import { getSupabaseClient } from '@/lib/supabase'
import { AuthCard } from '../components/AuthCard/AuthCard'

// v1: src/app/forgot-password/page.tsx.
export function ForgotPasswordPage() {
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

  const backToSignIn = (
    <Text variant="meta" align="center">
      <Link as={RouterAnchor} href="/login">Back to sign in</Link>
    </Text>
  )

  return (
    <AuthCard
      title="Reset Password"
      description="Enter the email address on your admin account and we'll send you a reset link."
    >
      {status === 'sent' ? (
        <Stack gap="base">
          <Text role="status" variant="meta" tone="success">
            Check your inbox. If an account exists for{' '}
            <Text as="strong" tone="primary">{email}</Text>, you&apos;ll receive a reset link shortly.
          </Text>
          {backToSignIn}
        </Stack>
      ) : (
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
            {error && <Text role="alert" variant="meta" tone="danger">{error}</Text>}
            <Button type="submit" fullWidth loading={status === 'sending'}>
              Send Reset Link
            </Button>
            {backToSignIn}
          </Stack>
        </form>
      )}
    </AuthCard>
  )
}
