import { Card, CardBody, Heading, Stack, Text } from '@mond-design-system/react'
import type { ReactNode } from 'react'
import { Centered } from '@/components/Centered/Centered'
import { ComphqLogo } from '@/components/ComphqLogo/ComphqLogo'
import styles from './AuthCard.module.css'

// The panel all three auth screens sit in. v1 repeated it three times, and the
// copies had already drifted — only two of them carried a description, and the
// heading sizes differed for no reason anyone recorded.
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Centered>
      <Card className={styles.card}>
        <CardBody>
          <Stack gap="loose">
            <div className={styles.mark}>
              <ComphqLogo />
            </div>
            <Stack gap="tight">
              <Heading level={1}>{title}</Heading>
              {description && <Text variant="meta" tone="muted">{description}</Text>}
            </Stack>
            {children}
          </Stack>
        </CardBody>
      </Card>
    </Centered>
  )
}
