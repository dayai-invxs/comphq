import {
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  Inline,
  Input,
  Select,
  Skeleton,
  Text,
} from '@mond-design-system/react'
import type { DataColumn } from '@mond-design-system/react'
import { useEffect, useState } from 'react'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { useRoster } from '../../useRoster'
import type { RunFn, Volunteer, VolunteerRole } from '../../usePeople'
import { RosterSheet, type AddMode } from '../RosterSheet/RosterSheet'
import { CsvImport } from '@/components/CsvImport/CsvImport'
import { parseLookupCsv } from '@/lib/lookupCsv'
import styles from './VolunteersTab.module.css'

// v1: the volunteers half of src/app/[slug]/admin/people/page.tsx. The writes
// are useRoster's, shared with the athletes half; what is here is the role a
// volunteer holds, the filter on it, and an importer that takes a whole line
// as one name — a volunteer may be entered as "Doe, Jane".

/** v1's sentinel for "volunteers with no role", carried in the same select as
    the role ids because a native option value is a string either way. */
const NO_ROLE = '__none__'

interface Props {
  slug: string
  volunteers: Volunteer[]
  roles: VolunteerRole[]
  loading: boolean
  setLoading: (v: boolean) => void
  run: RunFn
  reload: () => Promise<void>
  setVolunteers: React.Dispatch<React.SetStateAction<Volunteer[]>>
  /** The screen's Add button is in the page header, above both rosters. */
  adding: boolean
  onCloseAdd: () => void
}

const BLANK = { name: '', roleId: '' }

export function VolunteersTab({
  slug, volunteers, roles, loading, setLoading, run, reload, setVolunteers, adding, onCloseAdd,
}: Props) {
  const roster = useRoster<Volunteer>({
    slug, resource: 'volunteers', noun: 'volunteer', swapField: 'newVolunteerId',
    rows: volunteers, setRows: setVolunteers, run, reload, setLoading,
  })

  const [form, setForm] = useState(BLANK)
  const [bulkText, setBulkText] = useState('')
  const [bulkRoleId, setBulkRoleId] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [deleting, setDeleting] = useState<Volunteer | null>(null)

  const editing = volunteers.find((v) => v.id === roster.editingId) ?? null
  const imported = parseLookupCsv(bulkText, roles, 1, bulkRoleId ? Number(bulkRoleId) : null)

  // The editor opens on whoever was tapped, so it opens holding what that
  // volunteer already is rather than what the last one was.
  useEffect(() => {
    if (editing) setForm({ name: editing.name, roleId: editing.roleId ? String(editing.roleId) : '' })
  }, [editing])

  function close() {
    roster.setEditingId(null)
    roster.setSwapToId('')
    onCloseAdd()
    setForm(BLANK)
  }

  function body() {
    return { name: form.name.trim(), roleId: form.roleId ? Number(form.roleId) : null }
  }

  function submit(mode: AddMode) {
    if (mode === 'bulk') return importMany()
    if (!form.name.trim()) return
    if (editing) {
      void roster.saveEdit(editing.id, body()).then(close)
      return
    }
    void roster.add(body(), close)
  }

  // COM-107: Name, Role. A role is matched by name, never created, so a list
  // naming one that is not there sends nothing. v1 took a whole line as the
  // name; a comma inside a name now needs quotes.
  function importMany() {
    const { lines, unknown } = imported
    if (!lines.length || unknown.length) return
    const entries = lines.map(({ name, refId }) => ({ name, body: { name, roleId: refId } }))
    void roster.bulk(entries, () => { setBulkText(''); close() })
  }


  // The label is only passed where there is no Field to carry one — a Field
  // labels its own control, and a second name on top of it is one too many.
  const roleSelect = (value: string, onChange: (v: string) => void, label?: string) => (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No role</option>
      {roles.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
    </Select>
  )

  const visible = volunteers
    .filter((v) => roster.matches(v.name))
    .filter((v) => !roleFilter || (roleFilter === NO_ROLE ? v.roleId === null : String(v.roleId) === roleFilter))

  const columns: DataColumn<Volunteer>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (v) => <Text as="span" variant="label">{v.name}</Text>,
    },
    ...(roles.length > 0 ? [{
      key: 'role',
      header: 'Role',
      cell: (v: Volunteer) => <Text as="span" tone="muted">{v.role?.name ?? '—'}</Text>,
    }] : []),
  ]

  return (
    <>
      {/* An empty list mid-read is not "No volunteers yet". */}
      {loading && volunteers.length === 0 ? (
        <div aria-busy="true">
          <Skeleton lines={6} />
        </div>
      ) : volunteers.length === 0 ? (
        <EmptyState
          title="No volunteers yet"
          description="Add them one at a time, or paste a whole list in at once."
        />
      ) : (
        <DataPanel title="Volunteers" description={`${volunteers.length} entered`} flush>
          <Inline gap="base" wrap className={styles.filters}>
            <Input
              type="search"
              size="sm"
              aria-label="Search volunteers by name"
              placeholder="Search by name…"
              value={roster.search}
              onChange={(e) => roster.setSearch(e.target.value)}
              className={styles.grow}
            />
            {roles.length > 0 && (
              <Select size="sm" aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="">All roles</option>
                {roles.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
                <option value={NO_ROLE}>No role</option>
              </Select>
            )}
          </Inline>
          <DataTable
            label="Volunteers"
            columns={columns}
            rows={visible}
            rowKey={(v) => String(v.id)}
            rowLabel={(v) => v.name}
            rowActions={(v) => (
              <Inline gap="hairline" justify="end">
                <Button size="sm" variant="ghost" onClick={() => roster.setEditingId(v.id)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(v)}>Remove</Button>
              </Inline>
            )}
            actionsHeader="Actions"
            empty="No volunteer matches that name."
            selected={roster.selected}
            onSelectedChange={roster.setSelected}
            selectionLabels={{
              row: (label) => `Select ${label}`,
              all: 'Select every volunteer',
              count: (n) => `${n} selected`,
            }}
            bulkActions={
              <Button
                size="sm"
                variant="danger"
                disabled={loading}
                onClick={() => roster.setConfirmDeleteSelected(true)}
              >
                Delete {roster.selected.length} selected
              </Button>
            }
          />
        </DataPanel>
      )}

      <RosterSheet
        noun="volunteer"
        plural="volunteers"
        roster={roster}
        adding={adding}
        onClose={close}
        busy={loading}
        onSubmit={submit}
        optionLabel={(v) => `${v.name}${v.role ? ` (${v.role.name})` : ''}`}
        fields={
          <>
            <Field label="Name" required>
              <Input
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            {roles.length > 0 && (
              <Field label="Role">
                {roleSelect(form.roleId, (v) => setForm((f) => ({ ...f, roleId: v })))}
              </Field>
            )}
          </>
        }
        bulk={
          <CsvImport
            format="Name, Role (role optional)"
            example={['Jane Doe, Judge', 'John Smith']}
            value={bulkText}
            onChange={setBulkText}
            refNoun="role"
            unknown={imported.unknown}
            fallback={roles.length > 0 && (
              <Field label="Default role (for lines that name none)">
                {roleSelect(bulkRoleId, setBulkRoleId)}
              </Field>
            )}
          />
        }
      />

      <ConfirmDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={(v) => roster.remove(v.id)}
        title="Remove volunteer?"
        description={deleting ? `${deleting.name} loses every heat they were assigned to.` : ''}
        confirmLabel="Remove volunteer"
        cancelLabel="Cancel"
        tone="danger"
        errorMessage={(message) => `Remove volunteer: ${message}`}
      />

      <ConfirmDialog
        open={roster.confirmDeleteSelected}
        onClose={() => roster.setConfirmDeleteSelected(false)}
        onConfirm={() => roster.deleteSelected()}
        title={`Delete ${roster.selected.length} volunteers?`}
        description="They lose every heat they were assigned to."
        confirmLabel={`Delete ${roster.selected.length}`}
        cancelLabel="Cancel"
        tone="danger"
        errorMessage={(message) => `Delete selected: ${message}`}
      />
    </>
  )
}
