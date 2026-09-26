import { Button, Container, DataTable, EmptyState, Heading, Input, Skeleton, Stack, Text, type DataColumn } from '@mond-design-system/react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useLeaderboard, type LeaderboardEntry } from '@/api/liveReads'
import { useSetScorePoints } from '@/api/scores'
import { ScoreCell } from '@/components/ScoreCell/ScoreCell'
import { divisionsOf, formatTotal, hasAnyScore, rankRows, sameEverywhere } from '@/lib/standings'
import styles from './AdminLeaderboardPage.module.css'

// v1: src/app/[slug]/admin/leaderboard/page.tsx. The public board plus one
// power: an organiser can overwrite a placing in place, which is how a judging
// decision that the scoring rules got wrong gets corrected.
//
// The board itself — grouping, ranking, cells — is the shared one, because v1
// had it written twice and a second copy of the ranking rule is a second thing
// to get inverted.
//
// One deliberate difference from v1: the read is the shared leaderboard query,
// which refreshes on its own cadence. v1's admin page fetched once and re-read
// after each override. The override still re-reads; the rest is the cache.

type Entry = LeaderboardEntry
type CellKey = { athleteId: number; workoutId: number }

export function AdminLeaderboardPage() {
  const { slug = '' } = useParams()
  const { data, isPending, error } = useLeaderboard(slug)
  const override = useSetScorePoints(slug)

  const [confirming, setConfirming] = useState<CellKey | null>(null)
  const [editing, setEditing] = useState<(CellKey & { value: string }) | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) editInputRef.current?.focus()
  }, [editing])

  const workouts = data?.workouts ?? []
  const entries = data?.entries ?? []
  const halfWeightIds = data?.halfWeightIds ?? []
  const workoutIds = workouts.map((w) => w.id)

  function savePoints() {
    if (!editing || override.isPending) return
    const points = parseInt(editing.value, 10)
    if (isNaN(points) || points < 1) return
    // The editor closes only on success: closed on a refusal it looks exactly
    // like an override that landed.
    override.mutate(
      { workoutId: editing.workoutId, athleteId: editing.athleteId, points },
      { onSuccess: () => setEditing(null) },
    )
  }

  function editor() {
    return (
      <div className={styles.editor}>
        <Text as="span" variant="meta" tone="muted">#</Text>
        <Input
          ref={editInputRef}
          aria-label="Points"
          type="number"
          min={1}
          size="sm"
          value={editing?.value ?? ''}
          onChange={(e) => setEditing((prev) => (prev ? { ...prev, value: e.target.value } : null))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') savePoints()
            if (e.key === 'Escape') setEditing(null)
          }}
        />
        <Button size="sm" onClick={savePoints} disabled={override.isPending}>Save</Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
      </div>
    )
  }

  function confirmer(key: CellKey, points: number | undefined) {
    return (
      <Stack gap="hairline">
        <Text variant="meta" tone="warning">Change points?</Text>
        <div className={styles.editor}>
          <Button size="sm" onClick={() => { setConfirming(null); setEditing({ ...key, value: String(points ?? '') }) }}>Yes</Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirming(null)}>No</Button>
        </div>
      </Stack>
    )
  }

  function scoreCell(entry: Entry, workoutId: number, number: number) {
    const key = { athleteId: entry.athleteId, workoutId }
    const same = (k: CellKey | null) => k?.athleteId === entry.athleteId && k?.workoutId === workoutId
    const ws = entry.workoutScores[workoutId]

    if (same(editing)) return editor()
    if (same(confirming)) return confirmer(key, ws?.points)
    return (
      <ScoreCell
        score={ws}
        onEditPoints={ws ? () => setConfirming(key) : undefined}
        editLabel={`edit WOD ${number} points for ${entry.athleteName}`}
      />
    )
  }

  const columns: DataColumn<{ entry: Entry; rank: number | '—' }>[] = [
    { key: 'rank', header: 'Rank', width: '4rem', cell: (r) => <Text as="span" variant="label" tone="muted">{r.rank}</Text> },
    { key: 'athlete', header: 'Athlete', cell: (r) => <Text as="span" variant="label">{r.entry.athleteName}</Text> },
    ...workouts.map((w) => ({
      key: `workout-${w.id}`,
      header: (
        <>
          WOD {w.number}
          {halfWeightIds.includes(w.id) && <Text as="span" variant="meta" tone="warning">½</Text>}
        </>
      ),
      cell: (r: { entry: Entry }) => scoreCell(r.entry, w.id, w.number),
    })),
    {
      key: 'total',
      header: 'Total Pts',
      cell: (r: { entry: Entry }) => (
        <Text as="span" variant="label">{hasAnyScore(r.entry) ? formatTotal(r.entry.totalPoints) : '—'}</Text>
      ),
    },
  ]

  function renderTable(divisionName: string | null) {
    const rows = entries.filter((e) => e.divisionName === divisionName)
    if (rows.length === 0) return null
    const name = divisionName ?? 'No Division'
    return (
      <section key={name} className={styles.division}>
        <Heading level={2} tone="accent">{name}</Heading>
        <DataTable
          label={`${name} standings`}
          columns={columns}
          rows={rankRows(rows, hasAnyScore, (a, b) => sameEverywhere(a, b, workoutIds))}
          rowKey={(r) => String(r.entry.athleteId)}
          rowLabel={(r) => r.entry.athleteName}
        />
      </section>
    )
  }

  if (isPending) {
    return (
      <Container width="wide">
        <div aria-busy="true"><Skeleton lines={6} /></div>
      </Container>
    )
  }

  return (
    <Container width="wide">
      <Stack gap="section">
        <Stack gap="hairline">
          <Heading level={1}>Overall Leaderboard</Heading>
          {workouts.length > 0 && (
            <Text tone="muted">
              Based on {workouts.length} completed workout{workouts.length !== 1 ? 's' : ''} · Lower points = better
            </Text>
          )}
        </Stack>

        {override.isError && (
          <Text role="alert" tone="danger">
            {override.error instanceof Error ? override.error.message : 'Could not change the points'}
          </Text>
        )}

        {/* A failed read is not an empty board: without this branch the
            refusal fell through to "No completed workouts yet." */}
        {error
          ? <EmptyState title="Could not load the leaderboard" description={error.message} />
          : workouts.length === 0
            ? <Text tone="muted">No completed workouts yet.</Text>
            : divisionsOf(entries).map((d) => renderTable(d))}
      </Stack>
    </Container>
  )
}
