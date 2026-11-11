import { Field, Input, Select, Stack, Switch, Text } from '@mond-design-system/react'
import { roundSizes } from '@/lib/knockout'
import { SCORE_TYPE_OPTIONS } from '@/lib/scoreTypes'

// The Score Type box, with "Knockout tournament" beside the plain types.
// A knockout still needs to know how a heat's results compare, so picking it
// asks for that ("Measured by") and for the rounds and how many advance.

export type KnockoutSettings = {
  knockout: boolean
  /** How a heat's results compare; the workout's scoreType. */
  scoreType: string
  rounds: string
  advance: string
  /** The winner wins the competition: the finished tournament's placings
      are the final standings, earlier workouts' points set aside. */
  decides: boolean
}

const KNOCKOUT = 'knockout'

interface Props {
  value: KnockoutSettings
  onChange: (next: KnockoutSettings) => void
  /** The workout's lanes, for the example under the boxes. */
  lanes: number
  /** Class for a box that should span the form's width. */
  wideClassName?: string
}

export function KnockoutFields({ value, onChange, lanes, wideClassName }: Props) {
  const set = (patch: Partial<KnockoutSettings>) => onChange({ ...value, ...patch })
  const rounds = Number(value.rounds), advance = Number(value.advance)
  const example = value.knockout && rounds >= 1 && advance >= 1 && lanes >= 1
    ? roundSizes(40, lanes, advance, rounds)
    : null

  return (
    <>
      <Field label="Score Type">
        <Select
          value={value.knockout ? KNOCKOUT : value.scoreType}
          onChange={(e) => (e.target.value === KNOCKOUT ? set({ knockout: true }) : set({ knockout: false, scoreType: e.target.value }))}
        >
          {SCORE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          <option value={KNOCKOUT}>Knockout tournament</option>
        </Select>
      </Field>

      {value.knockout && (
        <>
          <Field label="Measured by" hint="How results in a heat are compared">
            <Select value={value.scoreType} onChange={(e) => set({ scoreType: e.target.value })}>
              {SCORE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Rounds" hint="The last round is the final">
            <Input type="number" min={1} max={10} required value={value.rounds} onChange={(e) => set({ rounds: e.target.value })} />
          </Field>
          <Field label="Advance per heat" hint="Top N of each division in a heat move on">
            <Input
              type="number" min={1} max={Math.max(1, lanes - 1)} required
              value={value.advance} onChange={(e) => set({ advance: e.target.value })}
            />
          </Field>
          {example && (
            <Text variant="meta" tone="muted" className={wideClassName}>
              For example, 40 in a division with {lanes} lanes: {example.map((n, i) => (
                i === example.length - 1 ? `final of ${n}` : `round ${i + 1} of ${n}`
              )).join(' → ')}. Each division runs its own bracket; small divisions share a heat when the lanes allow.
            </Text>
          )}
          <Stack gap="hairline" className={wideClassName}>
            <Switch
              label="Winner wins the competition"
              checked={value.decides}
              onChange={(e) => set({ decides: e.target.checked })}
            />
            <Text as="p" variant="meta" tone="muted">
              For a final tournament run as the last workout. Once it is finished, the leaderboard ranks each division by the tournament&apos;s placings alone and ignores the points from every earlier workout.
            </Text>
          </Stack>
        </>
      )}
    </>
  )
}

/** The fields a workout create or update sends for these settings. */
export function knockoutPatch(v: KnockoutSettings) {
  return {
    scoreType: v.scoreType,
    knockout: v.knockout,
    knockoutRounds: v.knockout ? Number(v.rounds) : null,
    knockoutAdvance: v.knockout ? Number(v.advance) : null,
    knockoutDecides: v.knockout && v.decides,
  }
}
