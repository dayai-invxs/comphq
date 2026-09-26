import { Button, ConfirmDialog, DataTable, EmptyState, Text } from '@mond-design-system/react'
import type { DataColumn } from '@mond-design-system/react'
import { useState } from 'react'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { withoutKnown } from '@/lib/csv'
import { NameSheet } from '../NameSheet/NameSheet'

// v1 wrote this section twice in src/app/[slug]/admin/setup/page.tsx — once for
// workout locations, once for volunteer roles — identical but for the words in
// it. Here it is one component and the words are props.
//
// The writes are the caller's, handed in as plain promises, so this file holds
// no endpoint and no query key. It reports nothing: v1 funnelled every failure
// into one banner at the top of the page, and the page still owns that.
//
// A row is a name, so adding one and renaming one are the same act and open the
// same sheet. That is where defect 25 — the typed name cleared whether or not
// the write landed — is fixed.

export interface NamedRow {
  id: number
  name: string
}

interface Props {
  title: string
  description: string
  /** Names the column and the field in the sheet: "Location". */
  columnHeader: string
  /** Lower-case, for the buttons: "Delete location", "Add location". */
  noun: string
  emptyTitle: string
  emptyDescription: string
  placeholder: string
  deleteDescription: (name: string) => string
  rows: NamedRow[]
  busy?: boolean
  onAdd: (name: string) => Promise<unknown>
  /** Offers "Import many" on the add sheet. Gets only names not already listed. */
  onAddMany?: (names: string[]) => Promise<unknown>
  onSave: (id: number, name: string) => Promise<unknown>
  onDelete: (id: number) => Promise<unknown>
}

export function NamedListSection({
  title, description, columnHeader, noun, emptyTitle, emptyDescription, placeholder,
  deleteDescription, rows, busy, onAdd, onAddMany, onSave, onDelete,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<NamedRow | null>(null)
  const [deleting, setDeleting] = useState<NamedRow | null>(null)

  const addMany = onAddMany && ((names: string[]) => onAddMany(withoutKnown(names, rows.map((r) => r.name))))

  const columns: DataColumn<NamedRow>[] = [
    {
      key: 'name',
      header: columnHeader,
      cell: (row) => <Text as="span" variant="label">{row.name}</Text>,
    },
  ]

  return (
    <>
      {rows.length === 0 ? (
        <DataPanel title={title} description={description}>
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={<Button onClick={() => setAdding(true)}>Add {noun}</Button>}
          />
        </DataPanel>
      ) : (
        <DataPanel
          title={title}
          description={description}
          actions={<Button size="sm" onClick={() => setAdding(true)}>Add {noun}</Button>}
          flush
        >
          <DataTable
            label={`${columnHeader} names`}
            columns={columns}
            rows={rows}
            rowKey={(row) => String(row.id)}
            rowLabel={(row) => row.name}
            rowActions={(row) => (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(row)}>Delete</Button>
              </>
            )}
            actionsHeader="Actions"
          />
        </DataPanel>
      )}

      <NameSheet
        open={adding || editing != null}
        title={editing ? editing.name : `Add ${noun}`}
        fieldLabel={columnHeader}
        placeholder={placeholder}
        initial={editing?.name ?? ''}
        submitLabel={editing ? 'Save' : `Add ${noun}`}
        busy={busy}
        onClose={() => { setAdding(false); setEditing(null) }}
        onSubmit={(name) => editing ? onSave(editing.id, name) : onAdd(name)}
        onSubmitMany={editing ? undefined : addMany}
        plural={`${noun}s`}
      />

      <ConfirmDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={(row) => onDelete(row.id)}
        title={`Delete ${noun}?`}
        description={deleting ? deleteDescription(deleting.name) : ''}
        confirmLabel={`Delete ${noun}`}
        cancelLabel="Cancel"
        tone="danger"
        errorMessage={(message) => `Delete ${noun}: ${message}`}
      />
    </>
  )
}
