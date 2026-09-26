import {
  Button, Field, Input, Select, Sheet, SheetBody, SheetFooter, SheetHeader, Stack, Switch, Text, Textarea,
} from '@mond-design-system/react'
import { useState, type FormEvent } from 'react'
import type { WorkoutLocation } from '@/api/workoutLocations'
import type { WorkoutDraft } from '@/api/workouts'
import { toIsoOrNull } from '@/lib/datetime'
import { parseMinSec } from '@/lib/minSec'
import { SCORE_TYPE_OPTIONS } from '@/lib/scoreTypes'
import styles from './AddWorkoutForm.module.css'

// v1's create form, box for box. Every box ships with a value, so a create
// carries a whole workout even when the operator typed only a number and a
// name — that is why the draft below has no optional fields.
//
// v1 unfolded this form in the middle of the workouts page, pushing the list of
// workouts down past sixteen fields; the list is what the screen is for, so the
// form opens beside it instead. That is the same table-and-sheet shape the rest
// of the admin tree uses, and it is why the form no longer draws a surface of
// its own.
//
// v1's four toggles were hand-drawn divs with a click handler; here they are
// the system's Switch, which is a checkbox with role="switch" and so is
// reachable by keyboard, which v1's were not.

interface Props {
  open: boolean
  locations: WorkoutLocation[]
  saving: boolean
  /** The create's own failure, kept beside the values that caused it. */
  error: unknown
  onClose: () => void
  onCreate: (draft: WorkoutDraft) => void
}

const FORM_ID = 'add-workout'

function ScoreType({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} className={styles.full}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {SCORE_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    </Field>
  )
}

/** A switch with the sentence v1 printed under it. Switch names itself from
    its label, so the sentence is beside it rather than inside the name. */
function Toggle({
  label, hint, checked, onChange,
}: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={styles.full}>
      <Stack gap="hairline">
        <Switch label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <Text variant="meta" tone="muted">{hint}</Text>
      </Stack>
    </div>
  )
}

export function AddWorkoutForm({ open, locations, saving, error, onClose, onCreate }: Props) {
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scoreType, setScoreType] = useState('time')
  const [lanes, setLanes] = useState('5')
  const [heatInterval, setHeatInterval] = useState('10:00')
  const [timeBetweenHeats, setTimeBetweenHeats] = useState('2:00')
  const [callTime, setCallTime] = useState('10:00')
  const [walkoutTime, setWalkoutTime] = useState('2:00')
  const [startTime, setStartTime] = useState('')
  const [mixedHeats, setMixedHeats] = useState(true)
  const [tiebreakEnabled, setTiebreakEnabled] = useState(false)
  const [tiebreakScoreType, setTiebreakScoreType] = useState('time')
  const [partBEnabled, setPartBEnabled] = useState(false)
  const [partBScoreType, setPartBScoreType] = useState('time')
  const [halfWeight, setHalfWeight] = useState(false)
  const [locationId, setLocationId] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onCreate({
      number: Number(number),
      name: name.trim(),
      description: description.trim() || null,
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
  }

  const clock = (label: string, value: string, onChange: (v: string) => void) => (
    <Field label={label}>
      <Input
        value={value}
        placeholder="0:00"
        onChange={(e) => onChange(e.target.value)}
        className={styles.clock}
      />
    </Field>
  )

  return (
    <Sheet open={open} onClose={onClose} label="Add workout">
      <SheetHeader onClose={onClose} closeLabel="Close add workout">Add workout</SheetHeader>
      <SheetBody>
        <form id={FORM_ID} onSubmit={handleSubmit}>
          <Stack gap="base">
            {error != null && (
              <Text role="alert" tone="danger">
                {error instanceof Error ? error.message : String(error)}
              </Text>
            )}

            <div className={styles.grid}>
              <Field label="Workout #" required>
                <Input
                  type="number"
                  required
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                />
              </Field>
              <Field label="Name" required>
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </Field>

              <Field label="Description" className={styles.full}>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Describe the workout movements, rep scheme, time cap, etc."
                />
              </Field>

              <Field label="Score Type">
                <Select value={scoreType} onChange={(e) => setScoreType(e.target.value)}>
                  {SCORE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>

              {locations.length > 0 && (
                <Field label="Location">
                  <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                    <option value="">No location</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </Select>
                </Field>
              )}

              <Field label="Lanes" required>
                <Input type="number" required value={lanes} onChange={(e) => setLanes(e.target.value)} />
              </Field>

              {clock('Heat Interval', heatInterval, setHeatInterval)}
              {clock('Time Between Heats', timeBetweenHeats, setTimeBetweenHeats)}
              {clock('Corral Call (before heat)', callTime, setCallTime)}
              {clock('Walk Out (before heat)', walkoutTime, setWalkoutTime)}

              <Field label="Start Time (optional)">
                <Input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </Field>

              <Toggle
                label="Mixed Heats"
                hint={mixedHeats
                  ? 'Athletes from different divisions can share a heat'
                  : 'Each heat contains only one division'}
                checked={mixedHeats}
                onChange={setMixedHeats}
              />

              <Toggle
                label="Tie Break Score"
                hint="Enter a tiebreak score per athlete to break ties"
                checked={tiebreakEnabled}
                onChange={setTiebreakEnabled}
              />
              {tiebreakEnabled && (
                <ScoreType
                  label="Tie Break Score Type"
                  value={tiebreakScoreType}
                  onChange={setTiebreakScoreType}
                />
              )}

              <Toggle
                label="Part A / Part B"
                hint="Add a second score (Part B) to each athlete"
                checked={partBEnabled}
                onChange={setPartBEnabled}
              />
              {partBEnabled && (
                <ScoreType
                  label="Part B Score Type"
                  value={partBScoreType}
                  onChange={setPartBScoreType}
                />
              )}

              <Toggle
                label="Half Weight"
                hint="This workout counts at 50% on the overall leaderboard"
                checked={halfWeight}
                onChange={setHalfWeight}
              />
            </div>
          </Stack>
        </form>
      </SheetBody>
      <SheetFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={FORM_ID} loading={saving} disabled={saving || !number || !name}>
          {saving ? 'Creating...' : 'Create Workout'}
        </Button>
      </SheetFooter>
    </Sheet>
  )
}
