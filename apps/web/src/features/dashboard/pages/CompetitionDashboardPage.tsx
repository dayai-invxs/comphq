import { useState } from 'react'
import { Badge, Button, DataTable, EmptyState, Link, Skeleton, Stack, Text } from '@mond-design-system/react'
import type { DataColumn } from '@mond-design-system/react'
import { useParams } from 'react-router'
import { useAthletes } from '@/api/athletes'
import { useWorkouts, type Workout } from '@/api/workouts'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { Notice } from '@/components/Notice/Notice'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { RouterAnchor } from '@/components/RouterAnchor'
import { apiDownload } from '@/lib/api'
import { statusBadge } from '@/lib/workoutStatus'
import styles from './CompetitionDashboardPage.module.css'

// v1: src/app/[slug]/admin/page.tsx. Two counts, the workout list, and the
// four things an organiser does from here.
//
// The athlete count is the whole roster, withdrawn athletes included — v1
// counted the array it was handed and so does this.
//
// v1 printed both counts as 0 while the reads were still out, so an organiser
// opening the screen was told the competition was empty and then corrected.
// A count that is not known yet is drawn as the space it will take.
//
// The workout list is where an organiser goes to run one, so it is the body of
// the screen; the exports are a job done once at the end and sit under it.

export function CompetitionDashboardPage() {
  const { slug = '' } = useParams()
  const workoutsQuery = useWorkouts(slug)
  const athletesQuery = useAthletes(slug)
  const workouts = workoutsQuery.data ?? []
  const athletes = athletesQuery.data ?? []
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const base = `/${slug}/admin`

  // v1 exported through `<a href download>`, which worked same-origin on a
  // cookie session. The functions are a different origin now and the session
  // is a bearer token, so the file is fetched and handed over as a blob.
  async function download(path: string) {
    if (downloading) return
    setError(null)
    setDownloading(true)
    try {
      await apiDownload(path)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setDownloading(false)
    }
  }

  const columns: DataColumn<Workout>[] = [
    {
      key: 'workout',
      header: 'Workout',
      cell: (w) => (
        <Link as={RouterAnchor} href={`${base}/workouts/${w.id}`} variant="plain">
          WOD {w.number}: {w.name}
        </Link>
      ),
    },
    {
      key: 'lanes',
      header: 'Lanes',
      width: '6rem',
      cell: (w) => <Text as="span" tone="muted">{w.lanes}</Text>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '9rem',
      cell: (w) => {
        const badge = statusBadge(w.status)
        return <Badge tone={badge.tone}>{badge.label}</Badge>
      },
    },
  ]

  return (
    <PageFrame
      title="Dashboard"
      description="Competition overview"
      wide
      actions={
        <>
          <Button as={RouterAnchor} href={`${base}/people`}>Manage athletes</Button>
          <Button as={RouterAnchor} href={`${base}/workouts`} variant="secondary">Manage workouts</Button>
        </>
      }
    >
      <div className={styles.stats}>
        <Stat label="Athletes" count={athletes.length} pending={athletesQuery.isPending} failed={!!athletesQuery.error} />
        <Stat label="Workouts" count={workouts.length} pending={workoutsQuery.isPending} failed={!!workoutsQuery.error} />
      </div>

      <DataPanel title="Workouts" flush={workouts.length > 0}>
        {/* A failed read is not an empty competition: without this branch the
            refusal fell through to "No workouts yet". */}
        {workoutsQuery.error ? (
          <EmptyState title="Could not load the workouts" description={workoutsQuery.error.message} />
        ) : workoutsQuery.isPending ? (
          <div aria-busy="true"><Skeleton lines={3} /></div>
        ) : workouts.length === 0 ? (
          <EmptyState
            title="No workouts yet"
            description="A competition runs on its workouts. Add the first one and it appears here with its status."
            action={<Button as={RouterAnchor} href={`${base}/workouts`}>Manage workouts</Button>}
          />
        ) : (
          <DataTable
            label="Workouts and their status"
            columns={columns}
            rows={workouts}
            rowKey={(w) => String(w.id)}
            rowLabel={(w) => `WOD ${w.number}: ${w.name}`}
          />
        )}
      </DataPanel>

      <DataPanel
        title="Exports"
        description="Everything entered so far, as it stands right now."
        actions={
          <>
            <Button variant="secondary" size="sm" disabled={downloading} onClick={() => download(`/api/export?slug=${slug}`)}>
              Export (CSV)
            </Button>
            <Button variant="secondary" size="sm" disabled={downloading} onClick={() => download(`/api/export/zip?slug=${slug}`)}>
              Export (ZIP)
            </Button>
          </>
        }
      >
        <Stack gap="tight">
          {error && <Notice tone="danger" onDismiss={() => setError(null)} dismissLabel="Dismiss error">{error}</Notice>}
          {/* v1 put the ZIP's contents in a title attribute; a hint that only
              appears on hover is no hint on a phone, so it reads as text. */}
          <Text variant="meta" tone="muted">
            CSV: one file of results. ZIP: per-table CSVs plus a JSON manifest.
          </Text>
        </Stack>
      </DataPanel>
    </PageFrame>
  )
}

/** A count read across a room, in the panel every other block on the screen
    uses. The group inside is what carries the name: a titled panel would make
    a landmark called Workouts beside the workouts panel below, and two
    landmarks of one name cannot be told apart. */
function Stat({ label, count, pending, failed }: { label: string; count: number; pending: boolean; failed: boolean }) {
  return (
    <DataPanel tone="sunken">
      <div role="group" aria-label={label} aria-busy={pending}>
        {/* A count whose read failed is unknown, not zero. */}
        {pending
          ? <Skeleton variant="text" width="3ch" />
          : <Text as="span" tone="accent" className={styles.count}>{failed ? '—' : count}</Text>}
        <Text variant="meta" tone="muted">{label}</Text>
      </div>
    </DataPanel>
  )
}
