import { Button, Heading, Text } from '@mond-design-system/react'
import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useParams } from 'react-router'
import { useChecks, useLeaderboard, useOps } from '@/api/liveReads'
import { useLogo } from '@/api/logo'
import { CorralCall } from '@/components/CorralCall/CorralCall'
import { queryKeys } from '@/api/queryKeys'
import type { OpsData } from '@/lib/opsHeats'
import { useRealtimeInvalidation } from '@/lib/useRealtimeInvalidation'
import { TvLeaderboardView } from '../components/TvLeaderboardView/TvLeaderboardView'
import { TvScheduleView } from '../components/TvScheduleView/TvScheduleView'
import { leaderboardLayoutCount } from '../leaderboardLayouts'
import { SCHEDULE_LAYOUTS } from '../scheduleLayouts'
import { useScaleToFit } from '../useScaleToFit'
import { TV_ZOOM_MAX, TV_ZOOM_MIN, useTvZoom } from '../useTvZoom'
import styles from './TvPage.module.css'

// v1: src/app/[slug]/TV/page.tsx. The screen on the gym wall. Nobody presses
// anything on it once it is up, so it turns itself between the two halves of
// the board and reads on a timer. The one control is the zoom in its bar, for
// whoever sets the screen up (useTvZoom.ts).

/** Seconds on each half before turning, until the competition's own setting
    (Setup → TV Display, served with the leaderboard) has been read. */
const DEFAULT_SECONDS_PER_SCREEN = 10

// v1 compiled the QR target in as one competition's address, so every board
// ever printed sent the room to ruggedrumble's athlete list whatever
// competition it was showing (defect 27). The board already knows both halves
// of the answer: the competition is the slug it was opened with, and the host
// is the host it is being served from — the same one the phone scanning it
// will have to reach. The competition's root is its schedule.
function qrTarget(slug: string) {
  return new URL(`/${slug}`, window.location.origin).toString()
}

const VIEWS = {
  schedule: 'Schedule',
  leaderboard: 'Leaderboard',
} as const

type View = keyof typeof VIEWS

export function TvPage() {
  const { slug = '' } = useParams()
  const [view, setView] = useState<View>('schedule')
  const scanTo = qrTarget(slug)
  const { zoom, zoomIn, zoomOut } = useTvZoom()

  const { data: opsData, error: opsError } = useOps<OpsData>(slug)
  const { data: lbData, error: lbError } = useLeaderboard(slug)
  const { data: checksData } = useChecks(slug)
  const logo = useLogo(slug)
  const athleteChecks = checksData?.athleteChecks ?? {}

  const realtimeKeys = useMemo(
    () => [queryKeys.ops(slug), queryKeys.leaderboard(slug), queryKeys.checks(slug)],
    [slug],
  )
  useRealtimeInvalidation(slug, realtimeKeys)

  // Each half gets its full time from the moment it is up. A new pace saved
  // on Setup restarts the clock of the half on screen at that pace.
  const seconds = lbData?.tvSecondsPerScreen ?? DEFAULT_SECONDS_PER_SCREEN
  useEffect(() => {
    const id = setTimeout(
      () => setView((v) => (v === 'schedule' ? 'leaderboard' : 'schedule')),
      seconds * 1000,
    )
    return () => clearTimeout(id)
  }, [view, seconds])

  // Fitted again whenever what is on screen changes: the half that is up, and
  // the reads that half is drawn from — ops and walkout ticks for the
  // schedule, standings for the leaderboard. A read for the other half does
  // not touch the screen, so it does not start a fit. Nor does a new zoom: the
  // board is redrawn larger or smaller and has to be fitted again. Each half has
  // arrangements to try before anything is shrunk (scheduleLayouts.ts,
  // leaderboardLayouts.ts).
  const onSchedule = view === 'schedule'
  const { containerRef, contentRef, layout } = useScaleToFit(
    [view, onSchedule ? opsData : lbData, onSchedule ? checksData : null, zoom],
    onSchedule ? SCHEDULE_LAYOUTS.length : leaderboardLayoutCount(lbData),
  )

  // CSS `zoom` rather than the type scale alone, so the cards' padding, the
  // gaps and the badges grow with the type and the board keeps its
  // proportions. It goes on the board only. Not on the stage: the stage is
  // 100vh tall, and a zoomed 100vh is taller than the screen. Not on the bar:
  // its logo, heading, controls, scan line and QR code sit in one row across
  // the screen, and grown they ran off its right edge and took height from the
  // board; the bar stays its own size and the board below it gets the rest.
  // Zoom changes the room each card takes, so the board is fitted again
  // (above) and may move to fewer, wider heats or panels. The corral call is
  // left alone: it already fills the screen at its own size.
  const zoomed = zoom === 1 ? undefined : { zoom }

  return (
    <div className={styles.stage}>
      <header className={styles.bar}>
        {/* The heading changes with nobody acting, which is what a live region
            is for — the one thing on this screen an assistive reader cannot
            work out by looking again. */}
        <div className={styles.lead}>
          {/* The competition's own logo, when it has uploaded one. Not a
              link: nobody touches this screen. */}
          {logo.data?.url && (
            <img src={logo.data.url} alt="Competition logo" className={styles.logo} />
          )}
          <div role="status">
            <Heading level={1} className={styles.title}>{VIEWS[view]}</Heading>
          </div>
        </div>
        <div className={styles.aside}>
          <div className={styles.zoom} role="group" aria-label="Screen size">
            <Button variant="ghost" size="lg" className={styles.zoomButton} aria-label="Smaller" onClick={zoomOut} disabled={zoom <= TV_ZOOM_MIN}>−</Button>
            <Text as="span" tone="muted" className={styles.zoomLevel} aria-live="polite">{Math.round(zoom * 100)}%</Text>
            <Button variant="ghost" size="lg" className={styles.zoomButton} aria-label="Larger" onClick={zoomIn} disabled={zoom >= TV_ZOOM_MAX}>+</Button>
          </div>
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

      <main ref={containerRef} className={styles.main} style={zoomed}>
        <div ref={contentRef} data-testid="tv-content">
          {view === 'schedule'
            ? <TvScheduleView data={opsData} error={opsError} checks={athleteChecks} layout={layout} />
            : <TvLeaderboardView data={lbData} error={lbError} layout={layout} />}
        </div>
      </main>

      {/* Over whichever half is showing: the call is for the whole room. */}
      <CorralCall data={opsData} checks={athleteChecks} tv />
    </div>
  )
}
