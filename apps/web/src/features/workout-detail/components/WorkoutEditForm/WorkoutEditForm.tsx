import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Heading,
  Inline,
  Input,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@mond-design-system/react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { toIsoOrNull } from '@/lib/datetime'
import { formatMinSec, parseMinSec } from '@/lib/minSec'
import { SCORE_TYPE_OPTIONS } from '@/lib/scoreTypes'
import type { Workout } from '../../useWorkoutDetail'
import styles from './WorkoutEditForm.module.css'

// v1: src/components/workout-detail/WorkoutEditForm.tsx. Every setting a
// workout has. v1's secsToField/fieldToSecs are lib/minSec here — the create
// form on the workouts screen reads the same four boxes and there is one pair
// of conversions between them.

type WorkoutLocation = { id: number; name: string }

/** The inverse of toIsoOrNull, and the only caller is this form: v1 creates
    from literal defaults, so nothing else ever fills a datetime box from a
    stored instant. */
function toLocalDatetime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ScoreTypeField({
  label, value, onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {SCORE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  )
}

function MinSecField({
  label, value, onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Field label={label}>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0:00"
        className={styles.minSec}
      />
    </Field>
  )
}

function Toggle({
  on, onToggle, title, subtitle,
}: {
  on: boolean
  onToggle: () => void
  title: string
  subtitle: string
}) {
  return (
    <Stack gap="hairline" className={styles.wide}>
      <Switch label={title} checked={on} onChange={onToggle} />
      <Text variant="meta" tone="muted">{subtitle}</Text>
    </Stack>
  )
}

interface Props {
  workout: Workout
  loading: boolean
  locations: WorkoutLocation[]
  onSave: (patch: Record<string, unknown>) => Promise<boolean>
  onCancel: () => void
}

export function WorkoutEditForm({ workout, loading, locations, onSave, onCancel }: Props) {
  const [name, setName] = useState(workout.name)
  const [description, setDescription] = useState(workout.description ?? '')
  const [number, setNumber] = useState(String(workout.number))
  const [scoreType, setScoreType] = useState(workout.scoreType)
  const [lanes, setLanes] = useState(String(workout.lanes))
  const [heatInterval, setHeatInterval] = useState(formatMinSec(workout.heatIntervalSecs))
  const [timeBetweenHeats, setTimeBetweenHeats] = useState(formatMinSec(workout.timeBetweenHeatsSecs))
  const [callTime, setCallTime] = useState(formatMinSec(workout.callTimeSecs))
  const [walkoutTime, setWalkoutTime] = useState(formatMinSec(workout.walkoutTimeSecs))
  const [startTime, setStartTime] = useState(toLocalDatetime(workout.startTime))
  const [mixedHeats, setMixedHeats] = useState(workout.mixedHeats)
  const [tiebreakEnabled, setTiebreakEnabled] = useState(workout.tiebreakEnabled)
  const [tiebreakScoreType, setTiebreakScoreType] = useState(workout.tiebreakScoreType ?? 'time')
  const [partBEnabled, setPartBEnabled] = useState(workout.partBEnabled)
  const [partBScoreType, setPartBScoreType] = useState(workout.partBScoreType)
  const [halfWeight, setHalfWeight] = useState(workout.halfWeight)
  const [locationId, setLocationId] = useState(workout.locationId ? String(workout.locationId) : '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await onSave({
      name: name.trim(),
      description: description.trim() || null,
      number: Number(number),
      scoreType,
      lanes: Number(lanes),
      heatIntervalSecs: parseMinSec(heatInterval),
      timeBetweenHeatsSecs: parseMinSec(timeBetweenHeats),
      callTimeSecs: parseMinSec(callTime),
      walkoutTimeSecs: parseMinSec(walkoutTime),
      startTime: toIsoOrNull(startTime),
      mixedHeats,
      tiebreakEnabled,
      tiebreakScoreType,
      partBEnabled,
      partBScoreType,
      halfWeight,
      locationId: locationId ? Number(locationId) : null,
    })
    if (ok) onCancel()
  }

  return (
    <Card emphasis>
      <CardHeader>
        <Inline justify="between" align="center">
          <Heading level={2} variant="subtitle">Edit Settings</Heading>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        </Inline>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className={styles.grid}>
          <Field label="Workout #">
            <Input type="number" value={number} onChange={(e) => setNumber(e.target.value)} required />
          </Field>
          <Field label="Name">
            <Input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>

          <Field label="Description" className={styles.wide}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe the workout movements, rep scheme, time cap, etc."
            />
          </Field>

          <ScoreTypeField label="Score Type" value={scoreType} onChange={setScoreType} />

          {locations.length > 0 && (
            <Field label="Location">
              <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">No location</option>
                {locations.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
              </Select>
            </Field>
          )}

          <Field label="Lanes">
            <Input type="number" value={lanes} onChange={(e) => setLanes(e.target.value)} required />
          </Field>

          <MinSecField label="Heat Interval" value={heatInterval} onChange={setHeatInterval} />
          <MinSecField label="Time Between Heats" value={timeBetweenHeats} onChange={setTimeBetweenHeats} />
          <MinSecField label="Corral Call (before heat)" value={callTime} onChange={setCallTime} />
          <MinSecField label="Walk Out (before heat)" value={walkoutTime} onChange={setWalkoutTime} />

          <Field label="Start Time">
            <Input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>

          <Toggle
            on={mixedHeats}
            onToggle={() => setMixedHeats((v) => !v)}
            title="Mixed Heats"
            subtitle={mixedHeats
              ? 'Athletes from different divisions can share a heat'
              : 'Each heat contains only one division'}
          />

          <Toggle
            on={tiebreakEnabled}
            onToggle={() => setTiebreakEnabled((v) => !v)}
            title="Tie Break Score"
            subtitle="Enter a tiebreak score per athlete to break ties"
          />
          {tiebreakEnabled && (
            <ScoreTypeField
              label="Tie Break Score Type"
              value={tiebreakScoreType}
              onChange={setTiebreakScoreType}
            />
          )}

          <Toggle
            on={partBEnabled}
            onToggle={() => setPartBEnabled((v) => !v)}
            title="Part A / Part B"
            subtitle="Add a second score (Part B) to each athlete"
          />
          {partBEnabled && (
            <div className={styles.wide}>
              <ScoreTypeField
                label="Part B Score Type"
                value={partBScoreType}
                onChange={setPartBScoreType}
              />
            </div>
          )}

          <Toggle
            on={halfWeight}
            onToggle={() => setHalfWeight((v) => !v)}
            title="Half Weight"
            subtitle="This workout counts at 50% on the overall leaderboard"
          />

          <Inline gap="tight" className={styles.wide}>
            <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</Button>
            <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          </Inline>
        </form>
      </CardBody>
    </Card>
  )
}
