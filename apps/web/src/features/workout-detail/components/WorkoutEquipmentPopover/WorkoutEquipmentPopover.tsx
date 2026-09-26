import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Badge, Button, Inline, Input, Popover, PopoverBody, PopoverFooter, PopoverHeader,
  SegmentedControl, Select, Stack, Text,
} from '@mond-design-system/react'
import { apiDel, apiGet, apiPost } from '@/lib/api'
import { parseLookupCsv } from '@/lib/lookupCsv'
import { postEach } from '@/lib/postEach'
import { CsvImport } from '@/components/CsvImport/CsvImport'
import styles from './WorkoutEquipmentPopover.module.css'

// v1: src/components/workout-detail/WorkoutEquipmentPopover.tsx. Two of v1's
// three effects are gone: MDS `Popover` owns the viewport clamping v1 computed
// by hand and the outside-press listener it installed on `document`, and it
// adds an Escape key v1 never answered. Its panel is 320px clamped to the
// viewport, which is the width v1 arrived at. The load-on-open effect is v1's.
//
// The reads and the writes both go through @/lib/api. v1 read with `getJson`
// and wrote with raw `fetch`, and cross-origin neither carries the credentials
// the gateway wants; the paths are v1's, character for character.
//
// Each remove button is named for the item it removes. v1 named them all
// "Remove", which hands a screen reader a column of identical buttons.
//
// Two of v1's defects are fixed here rather than carried forward. v1 swallowed
// both reads, so a popover that could not reach the API drew the same empty
// list as a workout that needs no equipment (defect 21); and it never read the
// status of its DELETE, so a refused removal still took the row off the list
// and was back on the next open (defect 22). Both now say what happened and
// leave the list alone.
//
// COM-113: "Import many" takes a pasted or dropped list, Item, Division, one
// item per line. A division is matched by name, never created, so a list
// naming one that is not there sends nothing.

type Division = { id: number; name: string }
type EquipmentItem = { id: number; item: string; divisionId: number | null; division: Division | null }

type Props = { workoutId: string; slug: string }

const NO_DIVISION = '__none__'

const MODES = [
  { value: 'single' as const, label: 'Add one' },
  { value: 'bulk' as const, label: 'Import many' },
]

/** Everyone's kit first, then the divisions by name — v1's order. */
function groupByDivision(equipment: EquipmentItem[]) {
  const map = new Map<string, { label: string; items: EquipmentItem[] }>()
  for (const eq of equipment) {
    const key = eq.divisionId == null ? NO_DIVISION : String(eq.divisionId)
    const label = eq.division?.name ?? 'All Divisions'
    if (!map.has(key)) map.set(key, { label, items: [] })
    map.get(key)!.items.push(eq)
  }
  return [...map.keys()]
    .sort((a, b) => {
      if (a === NO_DIVISION) return -1
      if (b === NO_DIVISION) return 1
      return map.get(a)!.label.localeCompare(map.get(b)!.label)
    })
    .map((key) => ({ key, ...map.get(key)! }))
}

export function WorkoutEquipmentPopover({ workoutId, slug }: Props) {
  const [open, setOpen] = useState(false)
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [newItem, setNewItem] = useState('')
  const [newDivisionId, setNewDivisionId] = useState('')
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [bulkText, setBulkText] = useState('')
  const [bulkDivisionId, setBulkDivisionId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const groupId = useId()

  async function load() {
    try {
      const [eq, divs] = await Promise.all([
        apiGet<EquipmentItem[]>(`/api/workouts/${workoutId}/equipment?slug=${slug}`),
        apiGet<Division[]>(`/api/divisions?slug=${slug}`),
      ])
      setEquipment(eq)
      setDivisions(divs)
      setLoadError(null)
    } catch (err) {
      // A list that could not be read is not an empty list, and saying it is
      // sends someone to the floor without their kit.
      setLoadError(err instanceof Error ? err.message : 'Could not read the equipment list')
    }
  }

  useEffect(() => { if (open) void load() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addItem(e: FormEvent) {
    e.preventDefault()
    if (!newItem.trim()) return
    setLoading(true)
    setError(null)
    try {
      await apiPost(`/api/workouts/${workoutId}/equipment?slug=${slug}`, {
        item: newItem.trim(),
        divisionId: newDivisionId ? Number(newDivisionId) : null,
      })
      setNewItem('')
      await load()
    } catch (err) {
      // HttpError carries the response body as its message, so a refused post
      // shows the same string v1 read out of `await res.text()`.
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function importItems(e: FormEvent) {
    e.preventDefault()
    const { lines, unknown } = imported
    if (!lines.length || unknown.length) return
    setLoading(true)
    setError(null)
    try {
      await postEach(lines, (l) => l.name, (l) =>
        apiPost(`/api/workouts/${workoutId}/equipment?slug=${slug}`, { item: l.name, divisionId: l.refId }))
      setBulkText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      // Whatever landed is on the list, refusals or not.
      await load()
      setLoading(false)
    }
  }

  async function removeItem(id: number) {
    setLoading(true)
    setError(null)
    try {
      await apiDel(`/api/workouts/${workoutId}/equipment/${id}?slug=${slug}`)
      setEquipment((prev) => prev.filter((eq) => eq.id !== id))
    } catch (e) {
      // The row comes off the list only once the server has agreed to it.
      setError(e instanceof Error ? e.message : 'Could not remove the item')
    } finally {
      setLoading(false)
    }
  }

  const groups = groupByDivision(equipment)
  const imported = parseLookupCsv(bulkText, divisions, 1, bulkDivisionId ? Number(bulkDivisionId) : null, 'item')

  const divisionSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <Select
      size="sm"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={styles.division}
    >
      <option value="">All Divisions</option>
      {divisions.map((d) => (
        <option key={d.id} value={String(d.id)}>{d.name}</option>
      ))}
    </Select>
  )

  return (
    <>
      <Button
        ref={triggerRef}
        size="sm"
        variant="secondary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Equipment
        {equipment.length > 0 && <Badge tone="accent" className={styles.count}>{equipment.length}</Badge>}
      </Button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        label="Equipment List"
        placement="bottom-end"
        className={styles.panel}
      >
        <PopoverHeader onClose={() => setOpen(false)} closeLabel="Close">Equipment List</PopoverHeader>

        <PopoverBody>
          {loadError ? (
            <Text role="alert" variant="meta" tone="danger" align="center">
              Could not read the equipment list: {loadError}
            </Text>
          ) : equipment.length === 0 ? (
            <Text variant="meta" tone="muted" align="center">No equipment added yet.</Text>
          ) : (
            <Stack gap="base">
              {groups.map(({ key, label, items }) => (
                <Stack key={key} gap="hairline">
                  <Text id={`${groupId}-${key}`} variant="eyebrow" tone="accent">{label}</Text>
                  <ul aria-labelledby={`${groupId}-${key}`} className={styles.items}>
                    {items.map((eq) => (
                      <li key={eq.id} className={styles.item}>
                        <Text>{eq.item}</Text>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={`Remove ${eq.item}`}
                          disabled={loading}
                          onClick={() => void removeItem(eq.id)}
                        >
                          ×
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Stack>
              ))}
            </Stack>
          )}
        </PopoverBody>

        <PopoverFooter>
          <Stack gap="tight">
            <SegmentedControl
              size="sm"
              label="How to add equipment"
              options={MODES}
              value={mode}
              onChange={setMode}
              fullWidth
            />
            {error && <Text variant="meta" tone="danger">{error}</Text>}
            {mode === 'bulk' ? (
              <form onSubmit={importItems}>
                <Stack gap="tight">
                  <CsvImport
                    format="Item, Division (division optional)"
                    example={['Barbell, RX', 'Rower']}
                    value={bulkText}
                    onChange={setBulkText}
                    refNoun="division"
                    unknown={imported.unknown}
                    fallback={divisions.length > 0 &&
                      divisionSelect(bulkDivisionId, setBulkDivisionId, 'Default division (for lines that name none)')}
                  />
                  <Inline justify="end">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={loading || !imported.lines.length || imported.unknown.length > 0}
                    >
                      Import
                    </Button>
                  </Inline>
                </Stack>
              </form>
            ) : (
              <form onSubmit={addItem}>
                <Stack gap="tight">
                  <Input
                    size="sm"
                    aria-label="Equipment item"
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder="e.g. Barbell, 20kg plates…"
                  />
                  <Inline gap="tight" wrap>
                    {divisions.length > 0 && divisionSelect(newDivisionId, setNewDivisionId, 'Division')}
                    <Button type="submit" size="sm" disabled={loading || !newItem.trim()}>Add</Button>
                  </Inline>
                </Stack>
              </form>
            )}
          </Stack>
        </PopoverFooter>
      </Popover>
    </>
  )
}
