import { useState, type FormEvent } from 'react'
import {
  Badge, Button, Checkbox, ConfirmDialog, DataTable, EmptyState, Field, Inline, Input,
  PasswordInput, Sheet, SheetBody, SheetFooter, SheetHeader, Skeleton, Stack, Tag, Text, useToast,
} from '@mond-design-system/react'
import type { DataColumn } from '@mond-design-system/react'
import { useCompetitions } from '@/api/competitions'
import {
  useCreateUser,
  useDeleteUser,
  useSendPasswordReset,
  useUpdateUser,
  useUsers,
  type SiteUser,
} from '@/api/users'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { Notice } from '@/components/Notice/Notice'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { RouterAnchor } from '@/components/RouterAnchor'
import { HttpError } from '@/lib/http'

// v1: src/app/admin/users/page.tsx. Every account on the site, what each may
// administer, and the four things a super admin does about it.
//
// Three adaptations. The delete question is the system's ConfirmDialog rather
// than window.confirm, and the reset-mail acknowledgement is a toast rather
// than window.alert — same words, without stopping the page to say them. And
// v1 drew a Reset pw button on an account with no email, where pressing it
// returned early and did nothing; here the button is not offered, since there
// is no address to send to.
//
// The roster is a table, and both forms are sheets. v1 unfolded the add form
// above the list and the edit form inside the row it belonged to, so editing
// one account pushed every account below it down the page. A sheet leaves the
// list where it was.

const ADD_FORM = 'add-user'
const EDIT_FORM = 'edit-user'

/** The list a PATCH would carry: v1 syncs memberships rather than merging, so
    a super admin keeps none — their access comes from the flag. */
function membershipsToSend(isSuper: boolean, picked: Set<number>) {
  return isSuper ? [] : [...picked].sort((a, b) => a - b)
}

function toggle(set: Set<number>, id: number) {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function SiteUsersPage() {
  const users = useUsers()
  const competitions = useCompetitions()
  const create = useCreateUser()
  const update = useUpdateUser()
  const remove = useDeleteUser()
  const reset = useSendPasswordReset()
  const { toast } = useToast()

  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newIsSuper, setNewIsSuper] = useState(false)
  const [newComps, setNewComps] = useState<Set<number>>(new Set())

  const [editing, setEditing] = useState<SiteUser | null>(null)
  const [editIsSuper, setEditIsSuper] = useState(false)
  const [editComps, setEditComps] = useState<Set<number>>(new Set())

  const [removing, setRemoving] = useState<SiteUser | null>(null)

  const comps = competitions.data ?? []
  const denied = users.error instanceof HttpError && (users.error.status === 401 || users.error.status === 403)

  // A refused write is reported where the write was asked for, so the two
  // sheets carry their own. What is left is what belongs to the page: the read
  // that failed, and the mail that could not be sent.
  const failure = [denied ? null : users.error, reset.error].find(Boolean)

  function openAdd() {
    setAdding(true)
    create.reset()
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    await create.mutateAsync({
      email: email.trim(),
      password,
      isSuper: newIsSuper,
      competitionIds: membershipsToSend(newIsSuper, newComps),
    }).then(
      () => {
        setEmail('')
        setPassword('')
        setNewIsSuper(false)
        setNewComps(new Set())
        setAdding(false)
      },
      () => {},
    )
  }

  function startEdit(u: SiteUser) {
    setEditing(u)
    setEditIsSuper(u.isSuper)
    setEditComps(new Set(u.competitions.map((c) => c.id)))
    update.reset()
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    await update.mutateAsync({
      userId: editing.id,
      isSuper: editIsSuper,
      competitionIds: membershipsToSend(editIsSuper, editComps),
    }).then(() => setEditing(null), () => {})
  }

  async function sendReset(u: SiteUser) {
    await reset.mutateAsync(u.id).then(
      () => toast({ title: `Password reset email sent to ${u.email}.`, tone: 'success' }),
      () => {},
    )
  }

  if (denied) {
    return (
      <PageFrame title="Users" description="Manage admins and competition access">
        <EmptyState
          title="Super-admin access required"
          description="This screen holds every account on the site, so only a super admin may open it."
          action={<Button as={RouterAnchor} href="/admin">← Back to admin</Button>}
        />
      </PageFrame>
    )
  }

  const picker = (checked: Set<number>, onPick: (id: number) => void) => (
    <Stack gap="hairline">
      {comps.map((c) => (
        <Checkbox
          key={c.id}
          label={`${c.name} (${c.slug})`}
          checked={checked.has(c.id)}
          onChange={() => onPick(c.id)}
        />
      ))}
    </Stack>
  )

  const rows = users.data ?? []

  // What an account is called on screen is v1's wording; what a control that
  // acts on it is called has to be unique, and an account with no email has
  // only its id to be told apart by.
  const shown = (u: SiteUser) => u.email ?? '(no email)'
  const handle = (u: SiteUser) => u.email ?? u.id

  const columns: DataColumn<SiteUser>[] = [
    {
      key: 'user',
      header: 'Account',
      cell: (u) => (
        <Inline gap="tight" align="center" wrap>
          <Text as="span" variant="label">{shown(u)}</Text>
          {u.isSuper && <Badge tone="accent">super</Badge>}
        </Inline>
      ),
    },
    {
      key: 'access',
      header: 'Administers',
      cell: (u) => {
        if (u.isSuper) return <Text variant="meta" tone="muted">all competitions</Text>
        if (u.competitions.length === 0) {
          return <Text variant="meta" tone="muted">no competition access</Text>
        }
        return (
          <Inline gap="tight" align="center" wrap>
            {u.competitions.map((c) => <Tag key={c.id}>{c.name}</Tag>)}
          </Inline>
        )
      },
    },
  ]

  return (
    <PageFrame
      title="Users"
      description="Manage admins and competition access"
      wide
      actions={<Button onClick={openAdd}>Add user</Button>}
    >
      {failure instanceof Error && <Notice tone="danger">{failure.message}</Notice>}

      {users.isPending ? (
        <div aria-busy="true"><Skeleton lines={3} /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="An account signs in to the site. What it may administer is set here, one competition at a time or all of them."
          action={<Button onClick={openAdd}>Add user</Button>}
        />
      ) : (
        <DataPanel flush>
          <DataTable
            label="Accounts"
            columns={columns}
            rows={rows}
            rowKey={(u) => u.id}
            rowLabel={shown}
            actionsHeader="Manage"
            rowActions={(u) => (
              <Inline gap="tight" align="center">
                {u.email && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => sendReset(u)}
                    aria-label={`Reset password for ${handle(u)}`}
                  >
                    Reset pw
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit(u)}
                  aria-label={`Edit ${handle(u)}`}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemoving(u)}
                  aria-label={`Delete ${handle(u)}`}
                >
                  Delete
                </Button>
              </Inline>
            )}
          />
        </DataPanel>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} label="Add user">
        <SheetHeader onClose={() => setAdding(false)} closeLabel="Close add user">Add user</SheetHeader>
        <SheetBody>
          <form id={ADD_FORM} onSubmit={handleAdd}>
            <Stack gap="base">
              {create.isError && (
                <Notice tone="danger">
                  {create.error instanceof Error ? create.error.message : 'Could not add the account'}
                </Notice>
              )}
              <Field label="Email" required>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Password" hint="12 characters or more" required>
                <PasswordInput
                  required
                  minLength={12}
                  showLabel="Show password"
                  hideLabel="Hide password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Checkbox
                label="Super admin (full access to every competition)"
                checked={newIsSuper}
                onChange={(e) => setNewIsSuper(e.target.checked)}
              />
              {!newIsSuper && comps.length > 0 && (
                <Stack gap="tight">
                  <Text variant="meta" tone="muted">Grant admin on which competitions?</Text>
                  {picker(newComps, (id) => setNewComps((s) => toggle(s, id)))}
                </Stack>
              )}
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          <Button
            type="submit"
            form={ADD_FORM}
            loading={create.isPending}
            disabled={!email.trim() || password.length < 12}
          >
            Add User
          </Button>
        </SheetFooter>
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} label="Edit access">
        <SheetHeader onClose={() => setEditing(null)} closeLabel="Close edit access">Edit access</SheetHeader>
        <SheetBody>
          <form id={EDIT_FORM} onSubmit={saveEdit}>
            <Stack gap="base">
              {update.isError && (
                <Notice tone="danger">
                  {update.error instanceof Error ? update.error.message : 'Could not save the changes'}
                </Notice>
              )}
              <Text variant="label">{editing ? shown(editing) : ''}</Text>
              <Checkbox
                label="Super admin"
                checked={editIsSuper}
                onChange={(e) => setEditIsSuper(e.target.checked)}
              />
              {!editIsSuper && (
                <Stack gap="tight">
                  <Text variant="meta" tone="muted">Competitions</Text>
                  {picker(editComps, (id) => setEditComps((s) => toggle(s, id)))}
                </Stack>
              )}
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button type="submit" form={EDIT_FORM} loading={update.isPending}>Save Changes</Button>
        </SheetFooter>
      </Sheet>

      <ConfirmDialog
        target={removing}
        onClose={() => setRemoving(null)}
        onConfirm={(u) => remove.mutateAsync(u.id)}
        title="Delete user?"
        description={`Delete user ${removing ? shown(removing) : ''}? This cannot be undone.`}
        confirmLabel="Delete user"
        cancelLabel="Cancel"
        tone="danger"
      />
    </PageFrame>
  )
}
