import { Button, Card, CardBody, Heading, PasswordInput, Stack, Text } from '@mond-design-system/react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { Centered } from '@/components/Centered/Centered'
import { apiPost } from '@/lib/api'
import { HttpError } from '@/lib/http'
import { judgeToken, onJudgeTokenForgotten, rememberJudgeToken } from '@/lib/judgeToken'
import { useSession } from '@/lib/session'
import styles from './JudgeGate.module.css'

// The password in front of the judge and equipment screens. One gate for
// both, so a judge who opened one screen is not asked again by the other.
//
// The password is checked by the server (POST /api/settings/judge), which
// answers yes or no. It used to be read out of the public settings and
// compared here, so anyone could read it.
//
// A yes comes with a token (lib/judgeToken.ts), remembered per competition
// for the tab, which the screen's ticks carry back to the server. An unlock
// for one competition used to open every competition's judge screens. When
// the server stops taking the token — the password was changed — the screen
// locks and asks again.

export function JudgeGate({ title, children }: { title: string; children: ReactNode }) {
  const { slug = '' } = useParams()
  const { user, loading } = useSession()
  const [unlocked, setUnlocked] = useState(() => judgeToken(slug) != null)
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => onJudgeTokenForgotten(slug, () => {
    setUnlocked(false)
    setProblem('The password has changed. Enter the new one.')
  }), [slug])

  // Nothing is drawn while the session is unknown: a signed-in judge who is
  // shown a password box for a frame has been asked a question v1 never asked.
  if (loading) return null
  if (unlocked || user) return <>{children}</>

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (checking) return
    setChecking(true)
    try {
      const { token } = await apiPost<{ ok: true; token: string }>('/api/settings/judge', { slug, password: value })
      rememberJudgeToken(slug, token)
      setUnlocked(true)
    } catch (e) {
      setProblem(e instanceof HttpError && e.status === 403
        ? 'Incorrect password'
        : e instanceof HttpError && e.status === 429
        ? 'Too many tries. Wait a minute and try again.'
        : 'Could not check the password. Check the connection and try again.')
      setValue('')
    } finally {
      setChecking(false)
    }
  }

  return (
    <Centered>
      <Card className={styles.card}>
        <CardBody>
          <form onSubmit={submit}>
            <Stack gap="loose" align="center">
              <Heading level={1}>{title}</Heading>
              <PasswordInput
                aria-label="Password"
                placeholder="Enter password"
                autoFocus
                value={value}
                onChange={(e) => { setValue(e.target.value); setProblem(null) }}
                invalid={problem != null}
                showLabel="Show password"
                hideLabel="Hide password"
              />
              {problem && <Text variant="meta" tone="danger">{problem}</Text>}
              <Button type="submit" fullWidth loading={checking}>Enter</Button>
            </Stack>
          </form>
        </CardBody>
      </Card>
    </Centered>
  )
}
