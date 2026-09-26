import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import {
  Badge, Button, ConfirmDialog, DataTable, EmptyState, Field, Inline, Input, PasswordInput,
  Select, Sheet, SheetBody, SheetFooter, SheetHeader, Skeleton, Stack, Text,
} from '@mond-design-system/react'
import type { DataColumn } from '@mond-design-system/react'
import {
  useAddCompUser,
  useCompUsers,
  useRemoveCompUser,
  useSetCompUserRole,
  type CompRole,
  type CompUser,
} from '@/api/compUsers'
import { useMe } from '@/api/session'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { Notice } from '@/components/Notice/Notice'
import { PageFrame } from '@/components/PageFrame/PageFrame'

// v1: src/app/[slug]/admin/users/page.tsx. Who may work on this competition,
// and at which of the two roles.
//
// v1 asked its questions through window.confirm; here they are the system's
// ConfirmDialog, which keeps the prompt inside the page and lets a refused
// write report itself in the dialog that asked for it.
//
// Which questions get asked is v1's, not a tidied version of it: upgrading
// anyone asks, downgrading yourself asks, and taking another admin's rights
// away goes straight through.
//
// The roster is a table rather than a stack of cards, and the add form is a
// sheet rather than a block that unfolds above the list: everyone on the list
// carries the same two controls, so what tells them apart is the row, and the
// list is what the screen is for.

const FORM_ID = 'add-comp-user'

type Pending = { user: CompUser; role: CompRole }

export function CompetitionUsersPage() {
  const { slug = '' } = useParams()
  const me = useMe(true)
  const { data: users, isPending, error } = useCompUsers(slug)

  const add = useAddCompUser(slug)
  const setRole = useSetCompUserRole(slug)
  const remove = useRemoveCompUser(slug)

  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole_] = useState<CompRole>('user')

  const [roleChange, setRoleChange] = useState<Pending | null>(null)
  const [removing, setRemoving] = useState<CompUser | null>(null)

  function openForm() {
    setAdding(true)
    add.reset()
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    await add.mutateAsync({ email, password, role }).then(
      () => {
        setEmail('')
        setPassword('')
        setRole_('user')
        setAdding(false)
      },
      () => {},
    )
  }

  function changeRole(user: CompUser) {
    const next: CompRole = user.role === 'admin' ? 'user' : 'admin'
    const asks = next === 'admin' || user.userId === me.data?.id
    if (asks) setRoleChange({ user, role: next })
    else setRole.mutate({ userId: user.userId, role: next })
  }

  const name = (u: CompUser) => u.email ?? u.userId

  const rows = users ?? []

  const columns: DataColumn<CompUser>[] = [
    {
      key: 'user',
      header: 'User',
      cell: (u) => <Text as="span" variant="label">{name(u)}</Text>,
    },
    {
      key: 'role',
      header: 'Role',
      cell: (u) => (
        <Badge tone={u.role === 'admin' ? 'accent' : 'neutral'}>
          {u.role === 'admin' ? 'Admin' : 'User'}
        </Badge>
      ),
    },
  ]

  return (
    <PageFrame
      title="Competition Users"
      description="Admins and users with access to this competition"
      wide
      actions={<Button onClick={openForm}>Add user</Button>}
    >
      {/* The dialogs report their own refusals; the unasked role change — a
          direct downgrade of another admin — has no dialog, so it reports here. */}
      {setRole.isError && !roleChange && (
        <Notice tone="danger">
          {setRole.error instanceof Error ? setRole.error.message : 'Could not change the role'}
        </Notice>
      )}

      {/* A failed read is not an empty roster: without this branch the
          refusal fell through to "No users yet". */}
      {error ? (
        <EmptyState title="Could not load the users" description={error.message} />
      ) : isPending ? (
        <div aria-busy="true"><Skeleton lines={3} /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No users yet"
          description="Anyone added here can work on this competition. Admins can also manage who else has access."
          action={<Button onClick={openForm}>Add user</Button>}
        />
      ) : (
        <DataPanel flush>
          <DataTable
            label="Competition users"
            columns={columns}
            rows={rows}
            rowKey={(u) => u.userId}
            rowLabel={name}
            actionsHeader="Access"
            rowActions={(u) => (
              <Inline gap="tight" align="center">
                {/* Every row carries these two, so each says whose access it
                    changes rather than only what it does. */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => changeRole(u)}
                  aria-label={`${u.role === 'admin' ? 'Downgrade' : 'Upgrade'} ${name(u)}`}
                >
                  {u.role === 'admin' ? 'Downgrade to User' : 'Upgrade to Admin'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemoving(u)}
                  aria-label={`Remove ${name(u)}`}
                >
                  Remove
                </Button>
              </Inline>
            )}
          />
        </DataPanel>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} label="Add user">
        <SheetHeader onClose={() => setAdding(false)} closeLabel="Close add user">
          Add user
        </SheetHeader>
        <SheetBody>
          <form id={FORM_ID} onSubmit={handleAdd}>
            <Stack gap="base">
              {add.isError && (
                <Notice tone="danger">
                  {add.error instanceof Error ? add.error.message : 'Could not add the user'}
                </Notice>
              )}
              <Field label="Email" required>
                <Input
                  type="email"
                  required
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Password" hint="At least 12 characters; ignored if the user already exists" required>
                <PasswordInput
                  required
                  minLength={12}
                  showLabel="Show password"
                  hideLabel="Hide password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label="Role">
                <Select value={role} onChange={(e) => setRole_(e.target.value as CompRole)}>
                  <option value="user">User — full access, cannot manage users</option>
                  <option value="admin">Admin — full access including user management</option>
                </Select>
              </Field>
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          <Button type="submit" form={FORM_ID} loading={add.isPending}>Add User</Button>
        </SheetFooter>
      </Sheet>

      <ConfirmDialog
        target={roleChange}
        onClose={() => setRoleChange(null)}
        onConfirm={(p) => setRole.mutateAsync({ userId: p.user.userId, role: p.role })}
        title={roleChange?.role === 'admin' ? 'Upgrade to competition admin?' : 'Downgrade to competition user?'}
        description={
          roleChange?.role === 'admin'
            ? `Upgrade ${roleChange ? name(roleChange.user) : ''} to competition admin? They will be able to manage users.`
            : 'You are about to downgrade yourself to a competition user. You will lose the ability to manage users.'
        }
        confirmLabel={roleChange?.role === 'admin' ? 'Upgrade' : 'Downgrade'}
        cancelLabel="Cancel"
        tone={roleChange?.role === 'admin' ? 'warning' : 'danger'}
      />

      <ConfirmDialog
        target={removing}
        onClose={() => setRemoving(null)}
        onConfirm={(u) => remove.mutateAsync(u.userId)}
        title="Remove user?"
        description={`Remove ${removing ? name(removing) : ''} from this competition?`}
        confirmLabel="Remove user"
        cancelLabel="Cancel"
        tone="danger"
      />
    </PageFrame>
  )
}
