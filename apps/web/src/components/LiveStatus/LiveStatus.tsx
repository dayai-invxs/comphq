import { Text } from '@mond-design-system/react'
import styles from './LiveStatus.module.css'

// The pulsing dot and the last-updated line, which v1 drew three times — in
// PublicSchedule, OpsView and AthleteControl — with the same markup and three
// copies of the same keyframes. The poll is invisible, so this is the only
// thing on the screen that says it is still being fed.

export function LiveStatus({ updatedAt }: { updatedAt: Date | null }) {
  return (
    <div className={styles.live}>
      <Text variant="meta" tone="muted">
        <span className={styles.dot} aria-hidden="true" />
        Live
      </Text>
      {updatedAt && (
        <Text variant="meta" tone="muted">Updated {updatedAt.toLocaleTimeString()}</Text>
      )}
    </div>
  )
}
