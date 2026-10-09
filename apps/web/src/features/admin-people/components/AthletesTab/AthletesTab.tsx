import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  Input,
  Inline,
  Select,
  Skeleton,
  Stack,
  Text,
} from '@mond-design-system/react'
import type { DataColumn } from '@mond-design-system/react'
import { useEffect, useMemo, useState } from 'react'
import { apiDel, apiPost } from '@/lib/api'
import type { Gender } from '@/api/athletes'
import { doubleEntries, entryWarnings, isTeam } from '@/lib/teams'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { useRoster } from '../../useRoster'
import type { Athlete, Division, RunFn } from '../../usePeople'
import { RosterSheet, type AddMode } from '../RosterSheet/RosterSheet'
import { TeamMembersField, membersBody, type MemberDraft } from '../TeamMembersField/TeamMembersField'
import { CsvImport } from '@/components/CsvImport/CsvImport'
import { parseLookupCsv } from '@/lib/lookupCsv'
import styles from './AthletesTab.module.css'

// v1: the athletes half of src/app/[slug]/admin/people/page.tsx. The writes are
// useRoster's, shared with the volunteers half; what is here is what only the
// athletes have — a bib, a division and a withdrawal.
//
// v1's hand-rolled select-all checkbox, its indeterminate ref and its "N
// selected" strip are the system's DataTable, which owns all three. One
// difference follows and is worth naming: DataTable keeps a selection only
// among the rows it is currently drawing, so taking a row while a search is
// narrowing the list lets go of anything the search is hiding. v1 kept those
// hidden rows selected, which meant "Delete 3 selected" could delete a row
// nobody could see.
//
// A row in a team division is a team: it takes one lane and gets one score,
// and the people on it are listed under its name. Whether a row is a team is
// its division's say, so the form changes with the division picked. Entries
// that do not match their division are flagged, never refused — a team with
// nobody listed still competes.

interface Props {
  slug: string
  athletes: Athlete[]
  divisions: Division[]
  loading: boolean
  setLoading: (v: boolean) => void
  run: RunFn
  reload: () => Promise<void>
  setAthletes: React.Dispatch<React.SetStateAction<Athlete[]>>
  /** The screen's Add button is in the page header, above both rosters. */
  adding: boolean
  onCloseAdd: () => void
}

type Form = { name: string; bib: string; divisionId: string; gender: Gender | ''; members: MemberDraft[] }
const BLANK: Form = { name: '', bib: '', divisionId: '', gender: '', members: [] }

export function AthletesTab({
  slug, athletes, divisions, loading, setLoading, run, reload, setAthletes, adding, onCloseAdd,
}: Props) {
  const roster = useRoster<Athlete>({
    slug, resource: 'athletes', noun: 'athlete/team', swapField: 'newAthleteId',
    rows: athletes, setRows: setAthletes, run, reload, setLoading,
  })

  const [form, setForm] = useState<Form>(BLANK)
  const [bulkText, setBulkText] = useState('')
  const [bulkDivisionId, setBulkDivisionId] = useState('')
  const [deleting, setDeleting] = useState<Athlete | null>(null)

  const editing = athletes.find((a) => a.id === roster.editingId) ?? null
  const imported = parseLookupCsv(bulkText, divisions, 2, bulkDivisionId ? Number(bulkDivisionId) : null)

  // The editor opens on whoever was tapped, so it opens holding what that
  // athlete already is rather than what the last one was.
  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        bib: editing.bibNumber ?? '',
        divisionId: editing.divisionId ? String(editing.divisionId) : '',
        gender: editing.gender ?? '',
        members: editing.members.map((m) => ({ name: m.name, gender: m.gender ?? '' })),
      })
    }
  }, [editing])

  function close() {
    roster.setEditingId(null)
    roster.setSwapToId('')
    onCloseAdd()
    setForm(BLANK)
  }

  const formDivision = divisions.find((d) => String(d.id) === form.divisionId) ?? null
  const formIsTeam = isTeam(formDivision)

  // A team sends its member list, which replaces the one it had. An individual
  // sends a gender and leaves any member list alone, so moving a team into an
  // individual division by mistake and back again loses nobody.
  function body() {
    return {
      name: form.name.trim(),
      bibNumber: form.bib.trim() || null,
      divisionId: form.divisionId ? Number(form.divisionId) : null,
      ...(formIsTeam
        ? { gender: null, members: membersBody(form.members) }
        : { gender: form.gender || null }),
    }
  }

  const formWarnings = entryWarnings(
    { gender: formIsTeam ? null : form.gender || null, members: formIsTeam ? membersBody(form.members) : [] },
    formDivision,
  )

  // Every row's warnings, worked out once per roster rather than per draw.
  const warnings = useMemo(() => {
    const doubled = doubleEntries(athletes)
    return new Map(athletes.map((a) => [a.id, [
      ...entryWarnings(a, a.division),
      ...(doubled.get(a.id) ?? []).map((n) => `${n} is also entered as an individual.`),
    ]]))
  }, [athletes])
  const flagged = [...warnings.values()].filter((w) => w.length > 0).length

  function submit(mode: AddMode) {
    if (mode === 'bulk') return importMany()
    if (!form.name.trim()) return
    if (editing) {
      void roster.saveEdit(editing.id, body()).then(close)
      return
    }
    void roster.add(body(), close)
  }

  // COM-108: Name, Bib, Division. A division is matched by name, never
  // created, so a list naming one that is not there sends nothing.
  function importMany() {
    const { lines, unknown } = imported
    if (!lines.length || unknown.length) return
    const entries = lines.map(({ name, cells, refId }) => ({
      name,
      body: { name, bibNumber: cells[1] || null, divisionId: refId },
    }))
    void roster.bulk(entries, () => { setBulkText(''); close() })
  }

  // One flag on one row, and the same button takes it back — so the row flips
  // where it stands and the write follows it out. A refusal flips it back, and
  // the page banner names the failure. The op returns true because apiDel
  // resolves undefined on a 204, which is also what run returns on failure.
  function withdraw(athlete: Athlete) {
    const path = `/api/athletes/${athlete.id}/withdraw?slug=${slug}`
    const was = athlete.withdrawn
    const mark = (w: boolean) =>
      setAthletes((prev) => prev.map((a) => (a.id === athlete.id ? { ...a, withdrawn: w } : a)))
    mark(!was)
    void run(was ? 'Un-withdraw athlete/team' : 'Withdraw athlete/team', async () => {
      await (was ? apiDel(path) : apiPost(path, {}))
      return true
    }).then((ok) => { if (!ok) mark(was) })
  }

  // The label is only passed where there is no Field to carry one — a Field
  // labels its own control, and a second name on top of it is one too many.
  const divisionSelect = (value: string, onChange: (v: string) => void, label?: string) => (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No division</option>
      {divisions.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
    </Select>
  )

  // A search for a person finds the team they are on.
  const visible = athletes.filter((a) => roster.matches(a.name) || a.members.some((m) => roster.matches(m.name)))

  const columns: DataColumn<Athlete>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (a) => {
        const issues = warnings.get(a.id) ?? []
        return (
          <Stack gap="hairline">
            <Inline gap="hairline" align="center" wrap>
              <Text as="span" variant="label">{a.name}</Text>
              {a.withdrawn && <Badge tone="warning">Withdrawn</Badge>}
              {issues.length > 0 && <Badge tone="warning" title={issues.join(' ')}>Check</Badge>}
            </Inline>
            {a.members.length > 0 && (
              <Text as="span" variant="meta" tone="muted">{a.members.map((m) => m.name).join(' · ')}</Text>
            )}
            {issues.length > 0 && (
              <Text as="span" variant="meta" tone="warning">{issues.join(' ')}</Text>
            )}
          </Stack>
        )
      },
    },
    {
      key: 'bib',
      header: 'Bib',
      width: '8rem',
      cell: (a) => <Text as="span" tone="muted">{a.bibNumber ?? '—'}</Text>,
    },
    ...(divisions.length > 0 ? [{
      key: 'division',
      header: 'Division',
      cell: (a: Athlete) => <Text as="span" tone="muted">{a.division?.name ?? '—'}</Text>,
    }] : []),
  ]

  return (
    <>
      {/* An empty roster mid-read is not "No athletes yet". */}
      {loading && athletes.length === 0 ? (
        <div aria-busy="true">
          <Skeleton lines={6} />
        </div>
      ) : athletes.length === 0 ? (
        <EmptyState
          title="No athletes or teams yet"
          description="Add them one at a time, or paste a whole roster in at once."
        />
      ) : (
        <DataPanel
          title="Athletes/Teams"
          description={`${athletes.length} entered${flagged ? ` · ${flagged} to check` : ''}`}
          flush
        >
          <Stack gap="base" className={styles.search}>
            <Input
              type="search"
              aria-label="Search athletes and team members by name"
              placeholder="Search by name…"
              value={roster.search}
              onChange={(e) => roster.setSearch(e.target.value)}
            />
          </Stack>
          <DataTable
            label="Athletes/Teams"
            columns={columns}
            rows={visible}
            rowKey={(a) => String(a.id)}
            rowLabel={(a) => a.name}
            rowMuted={(a) => a.withdrawn}
            rowActions={(a) => (
              <Inline gap="hairline" justify="end">
                <Button size="sm" variant="ghost" onClick={() => roster.setEditingId(a.id)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(a)}>Remove</Button>
              </Inline>
            )}
            actionsHeader="Actions"
            empty="No athlete or team matches that name."
            selected={roster.selected}
            onSelectedChange={roster.setSelected}
            selectionLabels={{
              row: (label) => `Select ${label}`,
              all: 'Select every athlete and team',
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
        noun="athlete/team"
        plural="athletes/teams"
        roster={roster}
        adding={adding}
        onClose={close}
        busy={loading}
        onSubmit={submit}
        optionLabel={(a) => `${a.name}${a.bibNumber ? ` (${a.bibNumber})` : ''}`}
        fields={
          <>
            <Field label={formIsTeam ? 'Team name' : 'Name'} required>
              <Input
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="Bib #">
              <Input
                value={form.bib}
                onChange={(e) => setForm((f) => ({ ...f, bib: e.target.value }))}
              />
            </Field>
            {divisions.length > 0 && (
              <Field label="Division">
                {divisionSelect(form.divisionId, (v) => setForm((f) => ({ ...f, divisionId: v })))}
              </Field>
            )}
            {formIsTeam ? (
              <TeamMembersField
                members={form.members}
                onChange={(members) => setForm((f) => ({ ...f, members }))}
                teamSize={formDivision!.teamSize}
              />
            ) : (
              <Field label="Gender">
                <Select
                  value={form.gender}
                  onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as Form['gender'] }))}
                >
                  <option value="">Not set</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </Select>
              </Field>
            )}
            {formWarnings.length > 0 && (
              <Text variant="meta" tone="warning" role="status">{formWarnings.join(' ')} You can still save.</Text>
            )}
          </>
        }
        bulk={
          <CsvImport
            format="Name, Bib, Division (bib and division optional)"
            example={['Jane Doe, 42, RX', 'John Smith']}
            value={bulkText}
            onChange={setBulkText}
            refNoun="division"
            unknown={imported.unknown}
            fallback={divisions.length > 0 && (
              <Field label="Default division (for lines that name none)">
                {divisionSelect(bulkDivisionId, setBulkDivisionId)}
              </Field>
            )}
          />
        }
        extra={editing && (
          /* The sheet's stack stretches its children; a button is not a
             field, so this row keeps it at its own size. */
          <Inline>
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => withdraw(editing)}
            >
              {editing.withdrawn ? 'Un-withdraw' : 'Withdraw'}
            </Button>
          </Inline>
        )}
      />

      <ConfirmDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={(a) => roster.remove(a.id)}
        title="Remove athlete/team?"
        description={deleting ? `${deleting.name} loses their lane in every heat they were in.` : ''}
        confirmLabel="Remove athlete/team"
        cancelLabel="Cancel"
        tone="danger"
        errorMessage={(message) => `Remove athlete/team: ${message}`}
      />

      <ConfirmDialog
        open={roster.confirmDeleteSelected}
        onClose={() => roster.setConfirmDeleteSelected(false)}
        onConfirm={() => roster.deleteSelected()}
        title={`Delete ${roster.selected.length} athletes/teams?`}
        description="They lose their lanes in every heat they were in."
        confirmLabel={`Delete ${roster.selected.length}`}
        cancelLabel="Cancel"
        tone="danger"
        errorMessage={(message) => `Delete selected: ${message}`}
      />
    </>
  )
}
