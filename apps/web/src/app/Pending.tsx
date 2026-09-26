import { Heading, Screen, ScreenContent, Stack, Text } from '@mond-design-system/react'
import styles from './GateStates.module.css'

// A route v1 serves and v3 has not ported yet. The table is complete from the
// first day — routes.parity.test.ts derives it from v1's own page tree and
// fails on a missing path — so the pages arrive behind it one phase at a time,
// and each placeholder names the file it is waiting for.
//
// routes.test.tsx keeps the inventory of these, and the Phase 8 gate is that
// the inventory is empty.
export function Pending({ page, phase }: { page: string; phase: number }) {
  return (
    <Screen>
      <ScreenContent className={styles.center}>
        <Stack gap="base" align="center">
          <Heading level={1}>Not ported yet</Heading>
          <Text tone="muted">
            v1 draws this at <code>src/app/{page}</code>. It lands in phase {phase}.
          </Text>
        </Stack>
      </ScreenContent>
    </Screen>
  )
}
