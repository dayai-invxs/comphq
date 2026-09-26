import { Button, Heading, Screen, ScreenContent, Stack, Text } from '@mond-design-system/react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Centered } from '@/components/Centered/Centered'
import styles from './GateStates.module.css'

// The router's catch-all. Before this existed a render throw anywhere was a
// permanent white page — on a gym projector, a dead board until someone
// found the machine. Two cases and no more: a URL the table does not serve,
// and everything else, which gets the one action that helps on a screen
// nobody is debugging. A reload also heals the common non-bug: a phone
// holding yesterday's chunk names after a deploy.

export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  if (notFound) {
    return (
      <Screen>
        <Centered as={ScreenContent} className={styles.gate}>
          <Stack gap="base" align="center">
            <Heading level={1}>Page not found</Heading>
            <Text tone="muted">This address does not match anything the app serves.</Text>
          </Stack>
        </Centered>
      </Screen>
    )
  }

  return (
    <Screen>
      <Centered as={ScreenContent} className={styles.gate}>
        <Stack gap="base" align="center">
          <Heading level={1}>Something went wrong</Heading>
          <Text tone="muted">The screen hit an error it could not recover from.</Text>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </Stack>
      </Centered>
    </Screen>
  )
}
