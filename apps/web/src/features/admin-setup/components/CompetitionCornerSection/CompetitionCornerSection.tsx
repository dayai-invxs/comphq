import { Badge, Button, Checkbox, Field, Inline, Input, Select, Stack, Switch, Text, type BadgeTone } from '@mond-design-system/react'
import { useState, type FormEvent } from 'react'
import { applyErrors, type CcChange, type CcPreview, type CcSelection, type CcSource } from '@/api/competitionCorner'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { Notice } from '@/components/Notice/Notice'
import { SCORE_TYPE_OPTIONS, type ScoreTypeValue } from '@/lib/scoreTypes'
import { defaultAccepted, toggle } from './selection'
import styles from './CompetitionCornerSection.module.css'

// Sets a competition up from a Competition Corner event: divisions, workouts,
// athletes and their lanes. Preview lists every difference; the admin keeps
// the ones they want and applies them. Running it again later is the re-sync —
// rows already imported match by their Competition Corner id, so only what
// moved shows up.

interface Props {
  onPreview: (source: CcSource) => Promise<CcPreview>
  onApply: (input: CcSource & CcSelection) => Promise<{ applied: number }>
}

const GROUPS: { entity: CcChange['entity']; title: string }[] = [
  { entity: 'division', title: 'Divisions' },
  { entity: 'workout', title: 'Workouts' },
  { entity: 'athlete', title: 'Athletes' },
  { entity: 'heats', title: 'Heats' },
]

const KIND: Record<CcChange['kind'], { word: string; tone: BadgeTone }> = {
  add: { word: 'New', tone: 'success' },
  update: { word: 'Changed', tone: 'accent' },
  link: { word: 'Link', tone: 'neutral' },
  remove: { word: 'Remove', tone: 'danger' },
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function show(value: unknown): string {
  if (value == null || value === '') return 'none'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export function CompetitionCornerSection({ onPreview, onApply }: Props) {
  const [url, setUrl] = useState('')
  const [tz, setTz] = useState(browserZone)
  const [mergePartB, setMergePartB] = useState(true)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<CcPreview | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [scoreTypes, setScoreTypes] = useState<Record<string, ScoreTypeValue>>({})
  const [errors, setErrors] = useState<string[]>([])
  const [done, setDone] = useState<string | null>(null)

  const source = { url: url.trim(), tz: tz.trim(), mergePartB }

  async function attempt(work: () => Promise<void>) {
    setBusy(true)
    setErrors([])
    setDone(null)
    try {
      await work()
    } catch (e) {
      setErrors(applyErrors(e))
    } finally {
      setBusy(false)
    }
  }

  const handlePreview = (e: FormEvent) => {
    e.preventDefault()
    void attempt(async () => {
      const next = await onPreview(source)
      setPreview(next)
      setAccepted(defaultAccepted(next.changes))
      setScoreTypes({})
    })
  }

  const handleApply = () => {
    if (!preview) return
    const keys = preview.changes.map((c) => c.key).filter((k) => accepted.has(k))
    const picked = Object.fromEntries(Object.entries(scoreTypes).filter(([k]) => accepted.has(k)))
    void attempt(async () => {
      const { applied } = await onApply({ ...source, version: preview.version, accepted: keys, scoreTypes: picked })
      setDone(`Applied ${plural(applied, 'change')} from ${preview.event.name}.`)
      setPreview(null)
    })
  }

  const setOne = (key: string, on: boolean) => setAccepted((a) => toggle(a, preview?.changes ?? [], key, on))
  const setGroup = (rows: CcChange[], on: boolean) =>
    setAccepted((a) => rows.reduce((acc, c) => toggle(acc, preview?.changes ?? [], c.key, on), a))

  return (
    <DataPanel
      title="Competition Corner"
      description="Import divisions, workouts, athletes and lanes from an event. Run it again to pick up changes."
    >
      <Stack gap="base">
        <form onSubmit={handlePreview}>
          <Stack gap="base">
            <Field label="Event link" hint="Like competitioncorner.net/events/12345">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} required />
            </Field>
            <Field label="Time zone" hint="The event's local times are read in this zone.">
              <Input value={tz} onChange={(e) => setTz(e.target.value)} required />
            </Field>
            <Switch
              label="Merge Part B into Part A"
              checked={mergePartB}
              onChange={(e) => setMergePartB(e.target.checked)}
            />
            <Text variant="meta" tone="muted">
              Athletes come from the heat sheets. Anyone registered without a lane is not imported.
            </Text>
            <Inline gap="base">
              <Button type="submit" disabled={busy || !url.trim()}>Preview changes</Button>
            </Inline>
          </Stack>
        </form>

        {errors.map((e) => <Notice key={e} tone="danger">{e}</Notice>)}
        {done && <Notice tone="success" onDismiss={() => setDone(null)}>{done}</Notice>}

        {preview && preview.changes.length === 0 && (
          <Text tone="muted">Already matches {preview.event.name}.</Text>
        )}

        {preview && preview.changes.length > 0 && (
          <Stack gap="base">
            <Text>
              {plural(preview.changes.length, 'change')} from {preview.event.name}.
            </Text>

            {GROUPS.map(({ entity, title }) => {
              const rows = preview.changes.filter((c) => c.entity === entity)
              if (rows.length === 0) return null
              const kept = rows.filter((c) => accepted.has(c.key)).length
              return (
                <fieldset key={entity} className={styles.group}>
                  <legend className={styles.legend}>{title} ({kept} of {rows.length})</legend>
                  <Stack gap="tight">
                    <Checkbox
                      label={`All ${title.toLowerCase()}`}
                      checked={kept === rows.length}
                      indeterminate={kept > 0 && kept < rows.length}
                      onChange={(e) => setGroup(rows, e.target.checked)}
                    />
                    {rows.map((c) => (
                      <ChangeRow
                        key={c.key}
                        change={c}
                        checked={accepted.has(c.key)}
                        scoreType={scoreTypes[c.key]}
                        onCheck={(on) => setOne(c.key, on)}
                        onScoreType={(v) => setScoreTypes((s) => ({ ...s, [c.key]: v }))}
                      />
                    ))}
                  </Stack>
                </fieldset>
              )
            })}

            <Inline gap="base">
              <Button onClick={handleApply} disabled={busy || accepted.size === 0}>
                Apply {plural(accepted.size, 'change')}
              </Button>
              <Button variant="ghost" onClick={() => setPreview(null)} disabled={busy}>Cancel</Button>
            </Inline>
          </Stack>
        )}
      </Stack>
    </DataPanel>
  )
}

interface RowProps {
  change: CcChange
  checked: boolean
  scoreType: ScoreTypeValue | undefined
  onCheck: (on: boolean) => void
  onScoreType: (v: ScoreTypeValue) => void
}

function ChangeRow({ change, checked, scoreType, onCheck, onScoreType }: RowProps) {
  const kind = KIND[change.kind]
  return (
    <Stack gap="hairline">
      <Checkbox
        label={<><Badge tone={kind.tone}>{kind.word}</Badge> {change.label}</>}
        checked={checked}
        onChange={(e) => onCheck(e.target.checked)}
      />
      <div className={styles.details}>
        <Stack gap="hairline">
          {change.fields.map((f) => (
            <Text key={f.field} variant="meta" tone="muted">{f.field}: {show(f.before)} → {show(f.after)}</Text>
          ))}
          {change.warnings.map((w) => <Text key={w} variant="meta" tone="warning">{w}</Text>)}
          {change.needsScoreType && checked && (
            <Field label={`Score type for ${change.label}`}>
              <Select value={scoreType ?? ''} onChange={(e) => onScoreType(e.target.value as ScoreTypeValue)} required>
                <option value="" disabled>Pick a score type</option>
                {SCORE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          )}
        </Stack>
      </div>
    </Stack>
  )
}
