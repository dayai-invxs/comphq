import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import {
  Button, ConfirmDialog, DataTable, EmptyState, Field, Inline, Input, Link, Sheet, SheetBody,
  SheetFooter, SheetHeader, Skeleton, Stack, Text,
} from '@mond-design-system/react'
import type { DataColumn } from '@mond-design-system/react'
import {
  useCompetitions,
  useCreateCompetition,
  useDeleteCompetition,
  type CompetitionSummary,
} from '@/api/competitions'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { Notice } from '@/components/Notice/Notice'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { RouterAnchor } from '@/components/RouterAnchor'
import styles from './AdminHomePage.module.css'

// v1: src/app/admin/page.tsx. Every competition on the site, and the form that
// makes another one.
//
// Two adaptations. v1 asked before deleting through window.confirm; here it is
// the system's ConfirmDialog, which also carries the server's answer — v1 threw
// the response away and removed the row either way, so a refused delete looked
// like it had worked until the next reload. And the list is the shared query
// rather than a fetch-once array, so a competition made here appears in the
// shell's own list without a reload.
//
// v1 drew the create form open under the list, so the list of competitions —
// the thing this screen is for — sat above a form nobody had asked for. It is
// a sheet now, opened by the one button at the top, which is the same shape
// every other list in the admin tree uses.

const FORM_ID = 'new-competition'

/** v1's slug rule, verbatim. The server cleans the slug again on the way in,
    so this is a suggestion rather than a contract. */
function deriveSlug(n: string) {
  return n.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function AdminHomePage() {
  const competitions = useCompetitions()
  const create = useCreateCompetition()
  const remove = useDeleteCompetition()
  const navigate = useNavigate()

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [removing, setRemoving] = useState<CompetitionSummary | null>(null)

  // v1 rewrites the slug on every keystroke in the name, hand-edit or not.
  function changeName(value: string) {
    setName(value)
    setSlug(deriveSlug(value))
  }

  function openForm() {
    setAdding(true)
    create.reset()
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    await create.mutateAsync({ name: name.trim(), slug }).then(
      (comp) => navigate(`/${comp.slug}/admin`),
      () => {},
    )
  }

  const rows = competitions.data ?? []

  const columns: DataColumn<CompetitionSummary>[] = [
    {
      key: 'competition',
      header: 'Competition',
      cell: (c) => (
        <Stack gap="hairline">
          <Link as={RouterAnchor} href={`/${c.slug}/admin`} variant="plain">{c.name}</Link>
          <Text variant="meta" tone="muted">/{c.slug}</Text>
        </Stack>
      ),
    },
    {
      key: 'public',
      header: 'Public page',
      cell: (c) => (
        <Link as={RouterAnchor} href={`/${c.slug}`}>
          <Text as="span" variant="meta">Competition Schedule</Text>
        </Link>
      ),
    },
  ]

  return (
    <PageFrame
      title="Competitions"
      description="Select a competition to manage, or create a new one."
      wide
      actions={<Button onClick={openForm}>New competition</Button>}
    >
      {/* A failed read is not an empty install: without this branch the
          refusal fell through to "No competitions yet". */}
      {competitions.error ? (
        <EmptyState title="Could not load the competitions" description={competitions.error.message} />
      ) : competitions.isPending ? (
        <div aria-busy="true"><Skeleton lines={3} /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No competitions yet"
          description="A competition holds its own athletes, workouts and schedule, and lives at its own address."
          action={<Button onClick={openForm}>New competition</Button>}
        />
      ) : (
        <DataPanel flush>
          <DataTable
            label="Competitions"
            columns={columns}
            rows={rows}
            rowKey={(c) => String(c.id)}
            rowLabel={(c) => c.name}
            actionsHeader="Manage"
            rowActions={(c) => (
              <Inline gap="tight" align="center">
                <Button as={RouterAnchor} href={`/${c.slug}/admin`} size="sm">Manage</Button>
                <Button variant="ghost" size="sm" onClick={() => setRemoving(c)} aria-label={`Delete ${c.name}`}>
                  Delete
                </Button>
              </Inline>
            )}
          />
        </DataPanel>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} label="New competition">
        <SheetHeader onClose={() => setAdding(false)} closeLabel="Close new competition">
          New competition
        </SheetHeader>
        <SheetBody>
          <form id={FORM_ID} onSubmit={handleCreate}>
            <Stack gap="base">
              {create.isError && (
                <Notice tone="danger">
                  {create.error instanceof Error ? create.error.message : 'Could not create the competition'}
                </Notice>
              )}
              <Field label="Competition Name" required>
                <Input
                  required
                  placeholder="e.g. Rugged Rumble 2026"
                  value={name}
                  onChange={(e) => changeName(e.target.value)}
                />
              </Field>
              {/* The prefix is the address people will be handed, so it is shown
                  beside the part that is being typed rather than described. */}
              <Field label="URL Slug" required>
                <Inline gap="tight" align="center" className={styles.slug}>
                  <Text as="span" tone="muted">comphq.pro/</Text>
                  <Input
                    required
                    placeholder="rugged-rumble-2026"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                  />
                </Inline>
              </Field>
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          <Button
            type="submit"
            form={FORM_ID}
            loading={create.isPending}
            disabled={create.isPending || !name.trim() || !slug.trim()}
          >
            Create Competition
          </Button>
        </SheetFooter>
      </Sheet>

      <ConfirmDialog
        target={removing}
        onClose={() => setRemoving(null)}
        onConfirm={(c) => remove.mutateAsync(c.id)}
        title="Delete competition?"
        description={`Delete "${removing?.name}"? This cannot be undone.`}
        confirmLabel="Delete competition"
        cancelLabel="Cancel"
        tone="danger"
      />
    </PageFrame>
  )
}
