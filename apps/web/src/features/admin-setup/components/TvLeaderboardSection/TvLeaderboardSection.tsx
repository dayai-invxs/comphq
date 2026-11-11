import { DataTable, EmptyState, Inline, Input, Select, Text } from '@mond-design-system/react'
import type { DataColumn } from '@mond-design-system/react'
import { useState } from 'react'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import type { Division } from '@/api/divisions'
import styles from './TvLeaderboardSection.module.css'

// v1: the TV Leaderboard section of src/app/[slug]/admin/setup/page.tsx. Both
// settings are maps keyed by division *name*, which is v1's and is what the TV
// screen reads — a renamed division loses its place and its percentage.
//
// The position select writes as it is picked. The percentage box keeps its own
// text while it is being typed and saves on blur, clamped, which is v1's.
//
// Seconds per screen is how long the TV shows the schedule, and then the
// leaderboard, before turning. It belongs to the whole board rather than to
// any division, so it sits on the panel's title line. Saved on blur like the
// percentages, clamped to 5–120; a box left empty or unreadable goes back to
// what was saved.

const DESCRIPTION = 'How long each screen shows, and the order and % of top athletes per division on the leaderboard'

const MIN_SECONDS = 5
const MAX_SECONDS = 120

interface Props {
  divisions: Division[]
  order: Record<string, number>
  percentages: Record<string, number>
  secondsPerScreen: number
  onSaveOrder: (next: Record<string, number>) => Promise<unknown>
  onSavePercentages: (next: Record<string, number>) => Promise<unknown>
  onSaveSecondsPerScreen: (seconds: number) => Promise<unknown>
}

export function TvLeaderboardSection({
  divisions, order, percentages, secondsPerScreen, onSaveOrder, onSavePercentages, onSaveSecondsPerScreen,
}: Props) {
  // Only the box being typed in holds text of its own; every other row reads
  // from the settings.
  const [draft, setDraft] = useState<Record<string, string>>({})

  const [secondsDraft, setSecondsDraft] = useState<string | null>(null)

  // Reported by the page banner; see NamedListSection.
  const attempt = (write: Promise<unknown>) => { void write.catch(() => {}) }

  function setPosition(name: string, value: string) {
    attempt(onSaveOrder(
      value
        ? { ...order, [name]: Number(value) }
        : Object.fromEntries(Object.entries(order).filter(([key]) => key !== name)),
    ))
  }

  function savePercentage(name: string, value: string) {
    setDraft(({ [name]: _dropped, ...rest }) => rest)
    attempt(onSavePercentages({ ...percentages, [name]: Math.min(100, Math.max(0, Number(value))) }))
  }

  function saveSeconds(value: string) {
    setSecondsDraft(null)
    const n = Math.round(Number(value))
    if (!value.trim() || !Number.isFinite(n)) return
    const clamped = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, n))
    if (clamped !== secondsPerScreen) attempt(onSaveSecondsPerScreen(clamped))
  }

  const seconds = (
    <label className={styles.secondsField}>
      <Text as="span" variant="label">Seconds per screen</Text>
      <Input
        type="number"
        size="sm"
        min={MIN_SECONDS}
        max={MAX_SECONDS}
        className={styles.seconds}
        value={secondsDraft ?? String(secondsPerScreen)}
        onChange={(e) => setSecondsDraft(e.target.value)}
        onBlur={(e) => saveSeconds(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
    </label>
  )

  const columns: DataColumn<Division>[] = [
    {
      key: 'name',
      header: 'Division',
      cell: (d) => <Text as="span" variant="label">{d.name}</Text>,
    },
    {
      key: 'position',
      header: 'Position',
      width: '5rem',
      cell: (d) => (
        <Select
          size="sm"
          aria-label={`TV position of ${d.name}`}
          value={order[d.name] ?? ''}
          onChange={(e) => setPosition(d.name, e.target.value)}
        >
          <option value="">—</option>
          {divisions.map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </Select>
      ),
    },
    {
      key: 'percent',
      header: 'Show',
      width: '7rem',
      cell: (d) => (
        <Inline gap="hairline" align="center">
          <Input
            type="number"
            size="sm"
            min={0}
            max={100}
            aria-label={`Percent of ${d.name} shown`}
            className={styles.percent}
            value={draft[d.name] ?? String(percentages[d.name] ?? 100)}
            onChange={(e) => setDraft((s) => ({ ...s, [d.name]: e.target.value }))}
            onBlur={(e) => savePercentage(d.name, e.target.value)}
          />
          <Text as="span" tone="muted">%</Text>
        </Inline>
      ),
    },
  ]

  if (!divisions.length) {
    return (
      <DataPanel title="TV Display" description={DESCRIPTION} actions={seconds}>
        <EmptyState
          title="No divisions to show"
          description="The board shows one division at a time. Add divisions further down this page and each will take a place here."
        />
      </DataPanel>
    )
  }

  return (
    <DataPanel title="TV Display" description={DESCRIPTION} actions={seconds} flush>
      <DataTable
        label="TV leaderboard display"
        columns={columns}
        rows={divisions}
        rowKey={(d) => String(d.id)}
        rowLabel={(d) => d.name}
      />
    </DataPanel>
  )
}
