import { Button, Field, Input, Select, Text, Textarea } from '@mond-design-system/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { parseScoreCard, type ParsedScoreCard } from '@/lib/scoreCard'
import type { Workout } from '@/features/workout-detail/useWorkoutDetail'
import { blankCards, laneCards } from '../../cards'
import { ScoreCard } from '../ScoreCard/ScoreCard'
import styles from './ScoreCardEditor.module.css'

// Where a workout's score card structure is pasted, checked and saved, with a
// card drawn beside it as it will print. The structure is JSON today (written
// with Claude from the workout's description); the same checks will stand
// between an AI's answer and the database later.

type Props = {
  workout: Workout
  slug: string
  competitionName: string
  logoUrl?: string | null
  showBib: boolean
  loading: boolean
  onSave: (patch: Record<string, unknown>) => Promise<boolean>
  onClose: () => void
}

const pretty = (v: unknown) => (v == null ? '' : JSON.stringify(v, null, 2))

/** The pasted text, read: empty, not JSON, failing its checks, or a structure. */
export function readScoreCardText(text: string): { empty: true } | { empty: false; json: false; error: string } | ({ empty: false; json: true } & ParsedScoreCard) {
  if (!text.trim()) return { empty: true }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { empty: false, json: false, error: e instanceof Error ? e.message : 'not JSON' }
  }
  return { empty: false, json: true, ...parseScoreCard(raw) }
}

export function ScoreCardEditor({ workout, slug, competitionName, logoUrl, showBib, loading, onSave, onClose }: Props) {
  const saved = pretty(workout.scoreCard)
  const [text, setText] = useState(saved)
  const [preview, setPreview] = useState('lane')
  const read = useMemo(() => readScoreCardText(text), [text])
  const spec = !read.empty && read.json && read.ok ? read.spec : null
  const valid = read.empty || spec != null
  const dirty = text.trim() !== saved.trim()

  const sample = useMemo(() => {
    const origin = window.location.origin
    if (preview.startsWith('v')) {
      return blankCards(workout, spec, { slug, origin, count: 1, version: Number(preview.slice(1)) })[0]
    }
    return laneCards(workout, spec, { slug, origin, showBib })[0]
      ?? blankCards(workout, spec, { slug, origin, count: 1, version: 0 })[0]
  }, [workout, spec, slug, showBib, preview])

  /** Answers a rep-definition question by writing the number into the text. */
  const answer = (key: string, value: string) => {
    if (!spec) return
    const n = Number(value)
    const next = {
      ...spec,
      repDefinitions: spec.repDefinitions?.map((d) => (d.key === key
        ? { ...d, value: value === '' || !(n > 0) ? null : n, source: value === '' ? d.source ?? null : 'organizer' as const }
        : d)),
    }
    setText(pretty(next))
  }

  const save = async () => {
    const ok = await onSave({ scoreCard: spec })
    if (ok) onClose()
  }

  const printBase = `/${slug}/admin/workouts/${workout.id}/score-cards`

  return (
    <DataPanel
      title="Score cards"
      description="Paste the workout’s score card structure. The card beside it is drawn as it will print."
      actions={(
        <>
          <Link to={printBase}>Print lane cards</Link>
          <Link to={`${printBase}?blank=10`}>Print blank cards</Link>
        </>
      )}
    >
      <div className={styles.layout}>
        <div className={styles.form}>
          <Field label="Structure (JSON)">
            <Textarea
              rows={18}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Empty prints a plain card: who, heat, lane and the score boxes."
              className={styles.json}
              spellCheck={false}
            />
          </Field>

          {!read.empty && !read.json && <div role="alert" className={styles.error}>Not valid JSON: {read.error}</div>}
          {!read.empty && read.json && !read.ok && (
            <div role="alert" className={styles.error}>
              Doesn’t pass its checks:
              <ul className={styles.list}>{read.errors.slice(0, 12).map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}

          {spec?.repDefinitions?.map((d) => (
            <Field key={d.key} label={d.question ?? `${d.movement}: reps`}>
              <Input
                type="number"
                min={0}
                step="any"
                value={d.value == null ? '' : String(d.value)}
                onChange={(e) => answer(d.key, e.target.value)}
                placeholder="Not set: printing waits"
              />
            </Field>
          ))}

          {spec?.warnings?.length ? (
            <div className={styles.warn}>
              Check before printing:
              <ul className={styles.list}>{spec.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          ) : null}

          <div className={styles.buttons}>
            <Button size="sm" onClick={save} disabled={!valid || !dirty || loading}>
              {read.empty && saved ? 'Remove structure' : 'Save'}
            </Button>
            <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>

        <div className={styles.previewCol}>
          <Select size="sm" aria-label="Preview" value={preview} onChange={(e) => setPreview(e.target.value)}>
            <option value="lane">First lane</option>
            {(spec?.versions ?? [{ label: 'Plain card' }]).map((v, i) => <option key={i} value={`v${i}`}>Blank · {v.label}</option>)}
          </Select>
          {sample ? (
            <div className={styles.preview}>
              <div className={styles.paper}>
                <ScoreCard card={sample} workout={workout} spec={spec} competitionName={competitionName} logoUrl={logoUrl} />
              </div>
            </div>
          ) : (
            <Text variant="meta" tone="muted">Nothing to preview.</Text>
          )}
        </div>
      </div>
    </DataPanel>
  )
}
