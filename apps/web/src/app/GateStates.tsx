import { Button, Heading, Screen, ScreenContent, Spinner, Stack, Text } from '@mond-design-system/react'
import type { ReactNode } from 'react'
import { Centered } from '@/components/Centered/Centered'
import styles from './GateStates.module.css'

// The answers an authorization gate can give before a screen exists: still
// checking, checked and refused, or the check itself failed. Both of v1's
// admin layouts drew their own copy of the first two, worded differently for
// the same case — and had no third at all, so a network error wore the
// refusal's words.

export function Booting({ label }: { label: string }) {
  return (
    <Screen>
      <Centered as={ScreenContent} className={styles.gate}>
        <Spinner label={label} />
      </Centered>
    </Screen>
  )
}

/** A failed access check is not a refusal: telling an admin "no access" over
    a network error says they lost something they still have. */
export function GateFailed({
  onRetry,
  onSignOut,
}: {
  onRetry: () => void
  onSignOut: () => void
}) {
  return (
    <Screen>
      <Centered as={ScreenContent} className={styles.gate}>
        <Stack gap="base" align="center">
          <Heading level={1}>Could not check access</Heading>
          <Text tone="muted">
            The access check did not get an answer. Check your connection and try again.
          </Text>
          <Button size="sm" onClick={onRetry}>Try again</Button>
          <Button variant="ghost" size="sm" onClick={onSignOut}>Sign out</Button>
        </Stack>
      </Centered>
    </Screen>
  )
}

export function NoAccess({
  title,
  children,
  onSignOut,
}: {
  title: string
  children: ReactNode
  onSignOut: () => void
}) {
  return (
    <Screen>
      <Centered as={ScreenContent} className={styles.gate}>
        <Stack gap="base" align="center">
          <Heading level={1}>{title}</Heading>
          <Text tone="muted">{children}</Text>
          <Button variant="ghost" size="sm" onClick={onSignOut}>Sign out</Button>
        </Stack>
      </Centered>
    </Screen>
  )
}
