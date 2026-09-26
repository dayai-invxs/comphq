import { Heading, Text } from '@mond-design-system/react'
import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useParams } from 'react-router'
import { useChecks, useLeaderboard, useOps } from '@/api/liveReads'
import { queryKeys } from '@/api/queryKeys'
import type { OpsData } from '@/lib/opsHeats'
import { useRealtimeInvalidation } from '@/lib/useRealtimeInvalidation'
import { TvLeaderboardView } from '../components/TvLeaderboardView/TvLeaderboardView'
import { TvScheduleView } from '../components/TvScheduleView/TvScheduleView'
import { useScaleToFit } from '../useScaleToFit'
import styles from './TvPage.module.css'

// v1: src/app/[slug]/TV/page.tsx. The screen on the gym wall. Nobody presses
// anything on it, so it turns itself between the two halves of the board and
// reads on a timer.

const SWITCH_INTERVAL_MS = 10_000

// v1 compiled the QR target in as one competition's address, so every board
// ever printed sent the room to ruggedrumble's athlete list whatever
// competition it was showing (defect 27). The board already knows both halves
// of the answer: the competition is the slug it was opened with, and the host
// is the host it is being served from — the same one the phone scanning it
// will have to reach.
function qrTarget(slug: string) {
  return new URL(`/${slug}/athlete-overview`, window.location.origin).toString()
}

const VIEWS = {
  schedule: 'Competition Schedule',
  leaderboard: 'Leaderboard',
} as const

type View = keyof typeof VIEWS

export function TvPage() {
  const { slug = '' } = useParams()
  const [view, setView] = useState<View>('schedule')
  const scanTo = qrTarget(slug)

  const { data: opsData, error: opsError } = useOps<OpsData>(slug)
  const { data: lbData, error: lbError } = useLeaderboard(slug)
  const { data: checksData } = useChecks(slug)
  const athleteChecks = checksData?.athleteChecks ?? {}

  const realtimeKeys = useMemo(
    () => [queryKeys.ops(slug), queryKeys.leaderboard(slug), queryKeys.checks(slug)],
    [slug],
  )
  useRealtimeInvalidation(realtimeKeys)

  useEffect(() => {
    const id = setInterval(
      () => setView((v) => (v === 'schedule' ? 'leaderboard' : 'schedule')),
      SWITCH_INTERVAL_MS,
    )
    return () => clearInterval(id)
  }, [])

  // Redrawn for each of the three things that change what the board is: new
  // ops, new standings, and the turn between them.
  const { containerRef, contentRef } = useScaleToFit([opsData, lbData, view])

  return (
    <div className={styles.stage}>
      <header className={styles.bar}>
        {/* The heading changes with nobody acting, which is what a live region
            is for — the one thing on this screen an assistive reader cannot
            work out by looking again. */}
        <div role="status">
          <Heading level={1} className={styles.title}>{VIEWS[view]}</Heading>
        </div>
        <div className={styles.aside}>
          <Text as="span" tone="muted" className={styles.scan}>Scan for Comp Info →</Text>
          {/* Drawn in currentColor rather than v1's pair of hex literals: a
              var() is not reliable in an SVG presentation attribute, and
              currentColor is. */}
          <QRCodeSVG
            value={scanTo}
            title={scanTo}
            size={72}
            bgColor="transparent"
            fgColor="currentColor"
            className={styles.qr}
          />
          {/* Says the same thing the heading does, so it is decoration. */}
          <div className={styles.dots} aria-hidden="true">
            {(Object.keys(VIEWS) as View[]).map((name) => (
              <span key={name} className={`${styles.dot} ${view === name ? styles.on : ''}`} />
            ))}
          </div>
        </div>
      </header>

      <main ref={containerRef} className={styles.main}>
        <div ref={contentRef} data-testid="tv-content">
          {view === 'schedule'
            ? <TvScheduleView data={opsData} error={opsError} checks={athleteChecks} />
            : <TvLeaderboardView data={lbData} error={lbError} />}
        </div>
      </main>
    </div>
  )
}
