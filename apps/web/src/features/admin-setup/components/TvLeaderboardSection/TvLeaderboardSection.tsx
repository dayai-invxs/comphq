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

interface Props {
  divisions: Division[]
  order: Record<string, number>
  percentages: Record<string, number>
  onSaveOrder: (next: Record<string, number>) => Promise<unknown>
  onSavePercentages: (next: Record<string, number>) => Promise<unknown>
}

export function TvLeaderboardSection({
  divisions, order, percentages, onSaveOrder, onSavePercentages,
}: Props) {
  // Only the box being typed in holds text of its own; every other row reads
  // from the settings.
  const [draft, setDraft] = useState<Record<string, string>>({})

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

  const columns: DataColumn<Division>[] = [
    {
      key: 'name',
      header: 'Division',
      cell: (d) => <Text as="span" variant="label">{d.name}</Text>,
    },
    {
      key: 'position',
      header: 'Position',
      width: '8rem',
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
      width: '8rem',
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
      <DataPanel title="TV Leaderboard" description="Set display order and % of top athletes shown per division">
        <EmptyState
          title="No divisions to show"
          description="The board shows one division at a time. Add divisions further down this page and each will take a place here."
        />
      </DataPanel>
    )
  }

  return (
    <DataPanel
      title="TV Leaderboard"
      description="Set display order and % of top athletes shown per division"
      flush
    >
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
