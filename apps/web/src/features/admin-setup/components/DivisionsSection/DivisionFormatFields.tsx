import { Field, Inline, Input, SegmentedControl, Select, Stack } from '@mond-design-system/react'
import { useEffect, useState } from 'react'
import type { DivisionShape } from '@/api/divisions'

// What an entry in a division looks like: one person, or a team of so many,
// and optionally how many of them are male and female. The counts are only ever
// warned about on the roster, so every field here can be left loose.
//
// An individual division's gender is the same two counts with a size of one —
// "Female" is womenCount 1 — so the roster checks both kinds the same way.

const KINDS = [
  { value: 'individual' as const, label: 'Individual' },
  { value: 'team' as const, label: 'Team' },
]

type IndividualGender = '' | 'female' | 'male'

function individualGender(s: DivisionShape): IndividualGender {
  if (s.womenCount === 1 && !s.menCount) return 'female'
  if (s.menCount === 1 && !s.womenCount) return 'male'
  return ''
}

/** A blank box is no requirement; anything else is a whole number. */
const count = (v: string): number | null => {
  const n = parseInt(v, 10)
  return Number.isNaN(n) || n < 0 ? null : n
}

export const INDIVIDUAL: DivisionShape = { teamSize: 1, menCount: null, womenCount: null }

export function DivisionFormatFields({ value, onChange }: {
  value: DivisionShape
  onChange: (next: DivisionShape) => void
}) {
  const team = value.teamSize > 1
  // The size box keeps what is typed, so it can be cleared and retyped; the
  // division only takes it once it reads as a team of 2 or more.
  const [sizeText, setSizeText] = useState(String(value.teamSize))
  useEffect(() => setSizeText(String(value.teamSize)), [value.teamSize])

  return (
    <Stack gap="base">
      <SegmentedControl
        label="Entries in this division"
        options={KINDS}
        value={team ? 'team' : 'individual'}
        onChange={(kind) => onChange(kind === 'team'
          ? { teamSize: Math.max(2, value.teamSize), menCount: null, womenCount: null }
          : INDIVIDUAL)}
        fullWidth
      />
      {team ? (
        <>
          <Field label="Athletes per team" required>
            <Input
              type="number"
              min={2}
              max={50}
              required
              value={sizeText}
              onChange={(e) => {
                setSizeText(e.target.value)
                const n = count(e.target.value)
                if (n != null && n >= 2) onChange({ ...value, teamSize: Math.min(50, n) })
              }}
              onBlur={() => setSizeText(String(value.teamSize))}
            />
          </Field>
          <Inline gap="base">
            <Field label="Male" hint="Blank for any">
              <Input
                type="number"
                min={0}
                max={value.teamSize}
                value={value.menCount == null ? '' : String(value.menCount)}
                onChange={(e) => onChange({ ...value, menCount: count(e.target.value) })}
              />
            </Field>
            <Field label="Female" hint="Blank for any">
              <Input
                type="number"
                min={0}
                max={value.teamSize}
                value={value.womenCount == null ? '' : String(value.womenCount)}
                onChange={(e) => onChange({ ...value, womenCount: count(e.target.value) })}
              />
            </Field>
          </Inline>
        </>
      ) : (
        <Field label="Gender">
          <Select
            value={individualGender(value)}
            onChange={(e) => {
              const g = e.target.value as IndividualGender
              onChange({ teamSize: 1, menCount: g === 'male' ? 1 : null, womenCount: g === 'female' ? 1 : null })
            }}
          >
            <option value="">Any</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </Select>
        </Field>
      )}
    </Stack>
  )
}
