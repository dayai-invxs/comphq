import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { Button, DataTable, EmptyState, Input, Skeleton, Text } from '@mond-design-system/react'
import type { DataColumn } from '@mond-design-system/react'
import { useActivity, type ActivityEntry } from '@/api/activity'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { describe } from '../describe'

// Who changed what, newest first: every score saved, heat completed, athlete
// withdrawn or setting changed by someone signed in. For the question that
// comes up on game day — "who changed this score?" — so it reads as sentences
// and can be searched for a name.

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' })

type Row = ActivityEntry & { text: string }

export function ActivityPage() {
  const { slug = '' } = useParams()
  const { data, isPending, error, refetch, isFetching } = useActivity(slug)
  const [search, setSearch] = useState('')

  const rows = useMemo<Row[]>(() => {
    if (!data) return []
    const all = data.entries.map((e) => ({ ...e, text: describe(e, data) }))
    const q = search.trim().toLowerCase()
    return q ? all.filter((r) => r.text.toLowerCase().includes(q) || (r.who ?? '').toLowerCase().includes(q)) : all
  }, [data, search])

  const columns: DataColumn<Row>[] = [
    { key: 'at', header: 'When', cell: (r) => <Text as="span" variant="meta">{when(r.at)}</Text> },
    { key: 'who', header: 'Who', cell: (r) => <Text as="span">{r.who ?? 'Unknown'}</Text> },
    { key: 'what', header: 'What', cell: (r) => <Text as="span" variant="label">{r.text}</Text> },
  ]

  return (
    <PageFrame
      title="Activity"
      description="Every change made by someone signed in, newest first"
      wide
      actions={<Button variant="secondary" onClick={() => void refetch()} loading={isFetching && !isPending}>Refresh</Button>}
    >
      {error ? (
        <EmptyState title="Could not load the activity" description={error.message} />
      ) : isPending ? (
        <div aria-busy="true"><Skeleton lines={6} /></div>
      ) : data.entries.length === 0 ? (
        <EmptyState title="Nothing yet" description="Scores, heats, withdrawals and setting changes appear here as they are made." />
      ) : (
        <>
          <Input
            aria-label="Search activity"
            placeholder="Search by athlete, workout or person"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {rows.length === 0 ? (
            <EmptyState title="Nothing matches" description={`No change mentions “${search.trim()}”.`} />
          ) : (
            <DataPanel flush>
              <DataTable label="Activity" columns={columns} rows={rows} rowKey={(r) => String(r.id)} rowLabel={(r) => r.text} />
            </DataPanel>
          )}
        </>
      )}
    </PageFrame>
  )
}
