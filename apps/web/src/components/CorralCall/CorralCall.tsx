import { Button } from '@mond-design-system/react'
import { useEffect, useId, useState } from 'react'
import { CORRAL_CALL_INSTRUCTION, corralCallHeadline, corralCallKey, corralCalls } from '@/lib/corralCall'
import { pendingHeats, type AthleteChecks } from '@/lib/nowHeat'
import type { OpsData } from '@/lib/opsHeats'
import { useNow } from '@/lib/useNow'
import styles from './CorralCall.module.css'

// The big "line up now" message the schedule screens put over everything when
// a heat's corral time comes (lib/corralCall.ts has the rule). It keeps its
// own clock so the page under it does not re-render every second.
//
// On the TV nobody can touch the screen, so it simply runs its minute. On a
// phone or a desktop the reader can close it; a closed call stays closed for
// that heat, and the next heat's call still comes up.

type Props = {
  data: OpsData | undefined
  checks?: AthleteChecks
  /** The wall screen: bigger type, and no way to close it. */
  tv?: boolean
}

export function CorralCall({ data, checks, tv = false }: Props) {
  const now = useNow()
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())
  const titleId = useId()

  const calls = corralCalls(pendingHeats(data, checks), now)
    .filter((h) => tv || !dismissed.has(corralCallKey(h)))
  const showing = calls.length > 0
  const keys = calls.map(corralCallKey).join(',')

  function dismiss() {
    setDismissed((prev) => new Set([...prev, ...keys.split(',')]))
  }

  useEffect(() => {
    if (tv || !showing) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tv, showing, keys]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!showing) return null

  const message = (
    <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
      <div id={titleId}>
        {calls.map((h) => (
          <p key={corralCallKey(h)} className={styles.headline}>{corralCallHeadline(h)}</p>
        ))}
      </div>
      <p className={styles.instruction}>{CORRAL_CALL_INSTRUCTION}</p>
      {!tv && (
        <div className={styles.actions}>
          {/* The only control on the overlay, so it takes focus. */}
          <Button autoFocus onClick={dismiss}>Dismiss</Button>
        </div>
      )}
    </div>
  )

  return tv ? (
    <div className={`${styles.overlay} ${styles.tv}`} role="alert">{message}</div>
  ) : (
    <div
      className={styles.overlay}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={dismiss}
    >
      {message}
    </div>
  )
}
