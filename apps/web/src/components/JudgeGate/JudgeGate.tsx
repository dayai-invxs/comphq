import { Button, Card, CardBody, Heading, PasswordInput, Stack, Text } from '@mond-design-system/react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { Centered } from '@/components/Centered/Centered'
import { apiPost } from '@/lib/api'
import { HttpError } from '@/lib/http'
import { useSession } from '@/lib/session'
import styles from './JudgeGate.module.css'

// The password in front of the judge and equipment screens. One gate for
// both, so a judge who opened one screen is not asked again by the other.
//
// The password is checked by the server (POST /api/settings/judge), which
// answers yes or no. It used to be read out of the public settings and
// compared here, so anyone could read it.
//
// Remembered per competition, for the tab: an unlock for one competition
// used to open every competition's judge screens.

const sessionKey = (slug: string) => `judgeUnlocked:${slug}`

function rememberedUnlock(slug: string): boolean {
  try { return sessionStorage.getItem(sessionKey(slug)) === '1' } catch { return false }
}

export function JudgeGate({ title, children }: { title: string; children: ReactNode }) {
  const { slug = '' } = useParams()
  const { user, loading } = useSession()
  const [unlocked, setUnlocked] = useState(() => rememberedUnlock(slug))
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  // Nothing is drawn while the session is unknown: a signed-in judge who is
  // shown a password box for a frame has been asked a question v1 never asked.
  if (loading) return null
  if (unlocked || user) return <>{children}</>

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (checking) return
    setChecking(true)
    try {
      await apiPost('/api/settings/judge', { slug, password: value })
      try { sessionStorage.setItem(sessionKey(slug), '1') } catch { /* this visit only */ }
      setUnlocked(true)
    } catch (e) {
      setProblem(e instanceof HttpError && e.status === 403
        ? 'Incorrect password'
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
