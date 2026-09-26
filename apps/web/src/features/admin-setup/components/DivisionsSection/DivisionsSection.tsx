import { Button, ConfirmDialog, DataTable, EmptyState, Select, Text } from '@mond-design-system/react'
import type { DataColumn } from '@mond-design-system/react'
import { useState } from 'react'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import type { Division } from '@/api/divisions'
import { withoutKnown } from '@/lib/csv'
import { NameSheet } from '../NameSheet/NameSheet'

// v1: the Divisions section of src/app/[slug]/admin/setup/page.tsx. A division
// carries an order, and that order is the heat running order, so the row offers
// its place in the list as a select — the one control on this screen that moves
// something rather than naming it.
//
// v1 also asked for an order value in its add form, on top of that select. Two
// controls for one property, one of them a raw database number the list does
// not otherwise show. A new division goes on the end, where a new thing goes,
// and the select moves it from there — every arrangement is still reachable and
// there is one way to reach it.
//
// Defect 23 — picking a position swapped the two divisions rather than shifting
// the ones between them — is fixed in useReorderDivisions, which is the shared
// write, not here. This hands over the two positions and nothing else.

interface Props {
  rows: Division[]
  busy?: boolean
  onAdd: (input: { name: string; order: number }) => Promise<unknown>
  onSave: (id: number, input: { name: string; order: number }) => Promise<unknown>
  /** Both are places in the list as drawn, counting from zero. */
  onMove: (from: number, to: number) => Promise<unknown>
  onDelete: (id: number) => Promise<unknown>
  /** A pasted list, each already given its place on the end (COM-109). */
  onAddMany?: (inputs: { name: string; order: number }[]) => Promise<unknown>
}

export function DivisionsSection({ rows, busy, onAdd, onSave, onMove, onDelete, onAddMany }: Props) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Division | null>(null)
  const [deleting, setDeleting] = useState<Division | null>(null)

  /** A new division runs last, so it takes the order after the last one's —
      which is v1's suggestion, counting from the last order rather than from
      how many divisions there are. */
  const nextOrder = (rows[rows.length - 1]?.order ?? 0) + 1

  /** A name already on the list is not sent again; the rest go on the end in
      the order they were listed. */
  const addMany = onAddMany && ((names: string[]) =>
    onAddMany(withoutKnown(names, rows.map((d) => d.name)).map((name, i) => ({ name, order: nextOrder + i }))))

  // v1's moveDivision guard: a re-pick of the position a division already has,
  // or a position off either end of the list, writes nothing.
  function move(division: Division, position: number) {
    const from = rows.indexOf(division)
    const to = position - 1
    if (from === to || to < 0 || to >= rows.length) return
    void onMove(from, to).catch(() => {})
  }

  const columns: DataColumn<Division>[] = [
    {
      key: 'order',
      header: 'Runs',
      width: '7rem',
      cell: (d) => (
        <Select
          size="sm"
          aria-label={`Position of ${d.name}`}
          value={rows.indexOf(d) + 1}
          onChange={(e) => move(d, Number(e.target.value))}
        >
          {rows.map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </Select>
      ),
    },
    {
      key: 'name',
      header: 'Division',
      cell: (d) => <Text as="span" variant="label">{d.name}</Text>,
    },
  ]

  return (
    <>
      {rows.length === 0 ? (
        <DataPanel
          title="Divisions"
          description="Division order determines the heat running order — lower order runs first."
        >
          <EmptyState
            title="No divisions yet"
            description="Athletes are entered into a division, and divisions run in the order they are listed."
            action={<Button onClick={() => setAdding(true)}>Add division</Button>}
          />
        </DataPanel>
      ) : (
        <DataPanel
          title="Divisions"
          description="Division order determines the heat running order — lower order runs first."
          actions={<Button size="sm" onClick={() => setAdding(true)}>Add division</Button>}
          flush
        >
          <DataTable
            label="Divisions in running order"
            columns={columns}
            rows={rows}
            rowKey={(d) => String(d.id)}
            rowLabel={(d) => d.name}
            rowActions={(d) => (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(d)}>Delete</Button>
              </>
            )}
            actionsHeader="Actions"
          />
        </DataPanel>
      )}

      <NameSheet
        open={adding || editing != null}
        title={editing ? editing.name : 'Add division'}
        fieldLabel="Division"
        placeholder="e.g. RX, Scaled, Masters"
        initial={editing?.name ?? ''}
        submitLabel={editing ? 'Save' : 'Add division'}
        busy={busy}
        onClose={() => { setAdding(false); setEditing(null) }}
        onSubmit={(name) => editing
          ? onSave(editing.id, { name, order: editing.order })
          : onAdd({ name, order: nextOrder })}
        onSubmitMany={editing ? undefined : addMany}
        plural="divisions"
      />

      <ConfirmDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={(d) => onDelete(d.id)}
        title="Delete division?"
        description={`Delete division "${deleting?.name ?? ''}"? Athletes in this division will be unassigned.`}
        confirmLabel="Delete division"
        cancelLabel="Cancel"
        tone="danger"
        errorMessage={(message) => `Delete division: ${message}`}
      />
    </>
  )
}
