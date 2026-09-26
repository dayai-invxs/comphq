import {
  Button, Field, FileDrop, Input, SegmentedControl, Sheet, SheetBody, SheetFooter, SheetHeader, Stack, Textarea,
} from '@mond-design-system/react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { parseNameList } from '@/lib/csv'

// One name, typed beside the list it belongs to.
//
// v1 edited a division, a location and a role inside their own table rows: the
// name became an input the width of the name column and the row's last cell
// held Save and Cancel. A row is a line of a list, not a form. The row stays a
// row and the name opens here, which is also where a new one is typed — so
// adding and renaming are the same act in the same place rather than a form
// pinned under the table and an input inside it.
//
// DEFECT 25, fixed here rather than at three call sites: v1 emptied the box the
// moment it sent, so a refused write took the typed name with it and left the
// screen looking as though it had landed. The name is cleared and the sheet is
// shut only once the write has actually landed; a refusal leaves both alone and
// is reported by the page banner the caller reports through.
//
// COM-109 / COM-110: given onSubmitMany, adding also takes a list — pasted one
// name per line, or a CSV file whose first column is the names. The same rule
// holds: the list is cleared only once the import has landed.

const MODES = [
  { value: 'single' as const, label: 'Add one' },
  { value: 'bulk' as const, label: 'Import many' },
]

export interface NameSheetProps {
  open: boolean
  /** Names the sheet: "Add location", or the name being changed. */
  title: string
  /** Names the one field: "Location". */
  fieldLabel: string
  placeholder: string
  /** What the box opens holding. Empty while adding. */
  initial: string
  submitLabel: string
  busy?: boolean
  onClose: () => void
  /** Rejects when the write is refused, which is what keeps the sheet open. */
  onSubmit: (name: string) => Promise<unknown>
  /** Offers "Import many" while adding. Pass only while adding. */
  onSubmitMany?: (names: string[]) => Promise<unknown>
  /** Plural and lower-case, for the import: "locations". */
  plural?: string
}

export function NameSheet({
  open, title, fieldLabel, placeholder, initial, submitLabel, busy, onClose, onSubmit, onSubmitMany,
  plural = `${fieldLabel.toLowerCase()}s`,
}: NameSheetProps) {
  const [name, setName] = useState(initial)
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [list, setList] = useState('')
  const bulk = onSubmitMany != null && mode === 'bulk'
  const names = bulk ? parseNameList(list, fieldLabel) : []
  // The footer button submits the form in the body, which it does not contain,
  // and three of these sit on the setup screen at once.
  const formId = `name-sheet-${fieldLabel.toLowerCase().replace(/\s+/g, '-')}`

  // It opens on whichever row was tapped, so it opens holding that row's name
  // rather than the last one's.
  useEffect(() => {
    if (open) setName(initial)
  }, [open, initial])

  function close() {
    setMode('single')
    onClose()
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (bulk) {
      if (!names.length) return
      void onSubmitMany(names).then(() => { setList(''); close() }, () => {})
      return
    }
    const trimmed = name.trim()
    if (!trimmed) return
    void onSubmit(trimmed).then(() => { setName(''); close() }, () => {})
  }

  const listLabel = `${plural[0].toUpperCase()}${plural.slice(1)}, one per line`

  return (
    <Sheet open={open} onClose={close} label={title}>
      <SheetHeader onClose={close} closeLabel={`Close ${fieldLabel.toLowerCase()}`}>{title}</SheetHeader>
      <SheetBody>
        <Stack gap="section">
          {onSubmitMany && (
            <SegmentedControl
              label={`How to add ${plural}`}
              options={MODES}
              value={mode}
              onChange={setMode}
              fullWidth
            />
          )}
          <form id={formId} onSubmit={submit}>
            {bulk ? (
              <Stack gap="base">
                <FileDrop
                  label="Drop a CSV here, or choose a file"
                  hint="first column is the name"
                  accept=".csv,text/csv,text/plain"
                  onFiles={async (files) => setList(await files[0].text())}
                />
                <Textarea
                  rows={8}
                  aria-label={listLabel}
                  placeholder={`${listLabel}\n${placeholder.replace(/^e\.g\. /, '').split(', ').join('\n')}`}
                  value={list}
                  onChange={(e) => setList(e.target.value)}
                />
              </Stack>
            ) : (
              <Field label={fieldLabel} required>
                <Input
                  required
                  autoFocus
                  placeholder={placeholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
            )}
          </form>
        </Stack>
      </SheetBody>
      <SheetFooter>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button type="submit" form={formId} loading={busy} disabled={bulk ? !names.length : !name.trim()}>
          {bulk ? `Import ${plural}` : submitLabel}
        </Button>
      </SheetFooter>
    </Sheet>
  )
}
