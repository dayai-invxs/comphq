import {
  Button,
  Divider,
  Field,
  Inline,
  SegmentedControl,
  Select,
  Sheet,
  SheetBody,
  SheetFooter,
  SheetHeader,
  Stack,
  Text,
} from '@mond-design-system/react'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Roster, Row } from '../../useRoster'
import styles from './RosterSheet.module.css'

// One person, edited beside the roster they belong to.
//
// v1 edited a competitor inside their own table row: the name became an input
// the width of the name column, the division became a select the width of the
// division column, and four buttons and three confirmation states shared the
// last one. A row is a line of a list — it is not a form, and a form squeezed
// into one is a form nobody can fill in.
//
// So the row stays a row and the person opens here, where a field is a field
// and the operations that need a second answer — replacing a competitor, and
// whatever else a particular roster keeps — have room to ask for it.
//
// Both rosters open the same sheet. What differs between an athlete and a
// volunteer is which fields they keep, and those are the caller's.

const MODES = [
  { value: 'single' as const, label: 'Add one' },
  { value: 'bulk' as const, label: 'Import many' },
]

export type AddMode = 'single' | 'bulk'

export interface RosterSheetProps<T extends Row> {
  /** Singular and lower-case: "athlete". Every label is built from it. */
  noun: string
  /** Plural and lower-case: "athletes". */
  plural: string
  roster: Roster<T>
  /** True while the sheet is adding somebody rather than changing somebody. */
  adding: boolean
  onClose: () => void
  /** The fields this roster keeps for one person. */
  fields: ReactNode
  /** The paste-a-roster-in form, shown only while adding. */
  bulk: ReactNode
  /** Add or save, given which of the two add forms was filled in. */
  onSubmit: (mode: AddMode) => void
  busy: boolean
  /** How a competitor reads in the replacement picker. */
  optionLabel: (row: T) => string
  /** Anything only one roster has — an athlete's withdrawal. */
  extra?: ReactNode
}

export function RosterSheet<T extends Row>({
  noun,
  plural,
  roster,
  adding,
  onClose,
  fields,
  bulk,
  onSubmit,
  busy,
  optionLabel,
  extra,
}: RosterSheetProps<T>) {
  const [mode, setMode] = useState<AddMode>('single')
  // The footer button submits the form in the body, which it does not contain.
  const formId = `roster-form-${noun}`
  const editing = roster.rows.find((row) => row.id === roster.editingId) ?? null
  const open = adding || editing != null
  const title = editing ? editing.name : `Add ${noun}`

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit(editing ? 'single' : mode)
  }

  function close() {
    setMode('single')
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} label={title}>
      <SheetHeader onClose={close} closeLabel={`Close ${noun}`}>{title}</SheetHeader>
      <SheetBody>
        <Stack gap="section">
          {!editing && (
            <SegmentedControl
              label={`How to add ${plural}`}
              options={MODES}
              value={mode}
              onChange={setMode}
              fullWidth
            />
          )}

          <form id={formId} onSubmit={submit}>
            <Stack gap="base">{editing || mode === 'single' ? fields : bulk}</Stack>
          </form>

          {editing && (
            <Stack gap="base">
              <Divider />
              {extra}
              <Field label={`Replace ${editing.name} with`}>
                <Select
                  value={roster.swapToId}
                  onChange={(e) => roster.setSwapToId(e.target.value)}
                >
                  <option value="">Nobody</option>
                  {roster.rows
                    .filter((row) => row.id !== editing.id)
                    .map((row) => (
                      <option key={row.id} value={String(row.id)}>{optionLabel(row)}</option>
                    ))}
                </Select>
              </Field>
              <Text variant="meta" tone="muted" className={styles.note}>
                The replacement takes over every heat and lane this {noun} was in.
              </Text>
              {/* The stack stretches its children; a button is not a field,
                  so this row keeps it at its own size. */}
              <Inline>
                <Button
                  variant="secondary"
                  disabled={busy || !roster.swapToId}
                  onClick={() => void roster.swap(editing.id)}
                >
                  Replace
                </Button>
              </Inline>
            </Stack>
          )}
        </Stack>
      </SheetBody>
      <SheetFooter>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button type="submit" form={formId} loading={busy}>
          {editing ? 'Save' : mode === 'single' ? `Add ${noun}` : `Import ${plural}`}
        </Button>
      </SheetFooter>
    </Sheet>
  )
}
