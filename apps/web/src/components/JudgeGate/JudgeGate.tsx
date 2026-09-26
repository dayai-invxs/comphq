import { Button, Card, CardBody, Heading, PasswordInput, Stack, Text } from '@mond-design-system/react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { useSettings } from '@/api/settings'
import { Centered } from '@/components/Centered/Centered'
import { useSession } from '@/lib/session'
import styles from './JudgeGate.module.css'

// The password in front of the judge and equipment screens. v1 wrote it twice —
// once in JudgeScheduleView, once in EquipmentControlView — identically but for
// the heading, and the copies had already begun to differ in when they read the
// settings. One gate, one session key, so a judge who opened one screen is not
// asked again by the other.
//
// It is a courtesy, not a lock: GET /api/settings hands the password to anyone
// who asks (defect 1, server-side and untouched here).
//
// Defect 20 is the half of that which is this component's own. v1 resolved the
// password as `settings.data?.judgePassword ?? BUILT_IN`, and `data` is
// undefined while the request is in flight — so for the first frames of every
// visit the compiled-in constant was a working answer, whatever the competition
// had set. The gate now waits for the read to settle. The constant survives
// only as the answer when the read fails, which is the case v1's fallback was
// there for: a box with no signal still has to let its judges in.

const SESSION_KEY = 'judgeUnlocked'
const BUILT_IN_PASSWORD = 'rug702'

export function JudgeGate({ title, children }: { title: string; children: ReactNode }) {
  const { slug = '' } = useParams()
  const { user, loading } = useSession()
  const settings = useSettings(slug)
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)

  // Nothing is drawn while the session is unknown: a signed-in judge who is
  // shown a password box for a frame has been asked a question v1 never asked.
  if (loading) return null
  if (unlocked || user) return <>{children}</>

  const settled = !settings.isPending
  const password = settings.data?.judgePassword ?? BUILT_IN_PASSWORD

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!settled) return
    if (value !== password) {
      setWrong(true)
      setValue('')
      return
    }
    sessionStorage.setItem(SESSION_KEY, '1')
    setUnlocked(true)
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
                onChange={(e) => { setValue(e.target.value); setWrong(false) }}
                invalid={wrong}
                showLabel="Show password"
                hideLabel="Hide password"
              />
              {wrong && <Text variant="meta" tone="danger">Incorrect password</Text>}
              <Button type="submit" fullWidth loading={!settled}>Enter</Button>
            </Stack>
          </form>
        </CardBody>
      </Card>
    </Centered>
  )
}
