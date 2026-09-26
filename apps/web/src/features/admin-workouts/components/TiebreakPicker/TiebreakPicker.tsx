import { Field, Select } from '@mond-design-system/react'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import type { Workout } from '@/api/workouts'

// The last resort in leaderboard ordering: when two athletes are still level
// after every workout placing, the raw score from this one decides. v1 wrote
// the setting on change, with no save button, and so does this.

interface Props {
  workouts: Workout[]
  workoutId: number | null
  onPick: (workoutId: number | null) => void
  saving: boolean
}

export function TiebreakPicker({ workouts, workoutId, onPick, saving }: Props) {
  return (
    <DataPanel
      title="Leaderboard Tiebreaker"
      description={'If athletes are still tied after comparing all workout placements, use the raw '
        + 'score from this workout to determine final placement.'}
    >
      <Field label="Tiebreak workout">
        <Select
          value={workoutId ?? ''}
          disabled={saving}
          onChange={(e) => onPick(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">None</option>
          {workouts.map((w) => (
            <option key={w.id} value={w.id}>WOD {w.number}: {w.name}</option>
          ))}
        </Select>
      </Field>
    </DataPanel>
  )
}
