import { Field, Input, Select, Stack, Switch, Text } from '@mond-design-system/react'
import { useState } from 'react'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { DEFAULT_POINTS_SCALE, POINTS_MAX, placePoints, type PointsScale } from '@/lib/pointsScale'

// v1: the Competition Settings section of src/app/[slug]/admin/setup/page.tsx.
// Every control writes as it is changed; there is no Save button anywhere in
// this section, and there was none in v1 either.
//
// The two toggles are controlled from above, and the settings mutation writes
// the flip into the cache before the PATCH goes out — so they move under the
// hand, as v1's did. Where v1 sent the PATCH with no error handling at all and
// a refused write left the switch showing a setting the server had never
// accepted, a refusal now rolls the cache back and reaches the page banner.
//
// The two boxes keep their own text while it is being typed and save on blur,
// which is v1's. They are seeded once: v1 read the settings a single time too.

interface Props {
  listed: boolean
  showBib: boolean
  leaderboardVisibility: 'per_heat' | 'per_workout'
  judgePassword: string
  judgeMaxConsecutive: number
  scoringSystem?: 'rank' | 'points'
  pointsScale?: PointsScale
  onPatch: (patch: {
    listed?: boolean
    showBib?: boolean
    leaderboardVisibility?: 'per_heat' | 'per_workout'
    judgePassword?: string
    judgeMaxConsecutive?: number
    scoringSystem?: 'rank' | 'points'
    pointsFirst?: number
    pointsStep?: number
  }) => Promise<unknown>
}

/** "1st 100 · 2nd 90 · … · 10th 10 · 11th+ 0": the scale as the board will
    award it, up to the place where it reaches its lowest. */
export function scalePreview(scale: PointsScale): string {
  const scoring = { system: 'points' as const, scale }
  const ordinal = (n: number) => {
    const tens = n % 100
    const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
    return `${n}${suffix}`
  }
  const parts: string[] = []
  let place = 1
  // The place where the points stop falling: every place from there gets 0.
  while (place < 1000 && placePoints(place + 1, scoring) < placePoints(place, scoring)) place++
  const last = place
  if (last === 1) return `Every place ${placePoints(1, scoring)}`
  const shown = last <= 6 ? [...Array(last).keys()].map((i) => i + 1) : [1, 2, 3, null, last - 1, last]
  for (const p of shown) parts.push(p == null ? '…' : `${ordinal(p)} ${placePoints(p, scoring)}`)
  if (last < 1000) parts[parts.length - 1] = `${ordinal(last)}+ ${placePoints(last, scoring)}`
  return parts.join(' · ')
}

export function CompetitionSettingsSection({
  listed, showBib, leaderboardVisibility, judgePassword, judgeMaxConsecutive,
  scoringSystem = 'rank', pointsScale = DEFAULT_POINTS_SCALE, onPatch,
}: Props) {
  const [password, setPassword] = useState(judgePassword)
  const [consecutive, setConsecutive] = useState(String(judgeMaxConsecutive))
  const [first, setFirst] = useState(String(pointsScale.first))
  const [step, setStep] = useState(String(pointsScale.step))
  const highest = scoringSystem === 'points'

  const perHeat = leaderboardVisibility === 'per_heat'

  // Reported by the page banner; caught so a refused write does not surface as
  // an unhandled rejection from an event handler.
  const patch = (next: Parameters<Props['onPatch']>[0]) => { void onPatch(next).catch(() => {}) }

  function savePassword(value: string) {
    if (!value.trim()) return
    patch({ judgePassword: value.trim() })
  }

  function saveConsecutive(value: number) {
    if (value < 1 || value > 20) return
    patch({ judgeMaxConsecutive: value })
  }

  /** Saves one of the two point numbers when it is a whole number in range;
      otherwise the box goes back to the saved value. */
  function savePoints(key: 'pointsFirst' | 'pointsStep', raw: string) {
    const n = Number(raw)
    const saved = { pointsFirst: pointsScale.first, pointsStep: pointsScale.step }[key]
    const reset = { pointsFirst: setFirst, pointsStep: setStep }[key]
    const min = key === 'pointsFirst' ? 1 : 0
    if (raw.trim() === '' || !Number.isInteger(n) || n < min || n > POINTS_MAX) { reset(String(saved)); return }
    if (n !== saved) patch({ [key]: n })
  }

  return (
    <DataPanel
      title="Competition Settings"
      description="Every control here writes as it is changed. There is no Save."
    >
      <Stack gap="base">
        <Stack gap="hairline">
          <Switch
            label="Public"
            aria-describedby="setup-listed-hint"
            checked={listed}
            onChange={() => patch({ listed: !listed })}
          />
          <Text id="setup-listed-hint" variant="note" tone="muted">
            {listed
              ? 'Listed on the comphq.pro home page for anyone to find'
              : 'Hidden from the comphq.pro home page. Anyone with the link or QR code can still open it.'}
          </Text>
        </Stack>

        <Stack gap="hairline">
          <Switch
            label="Show Bib Numbers"
            aria-describedby="setup-bib-hint"
            checked={showBib}
            onChange={() => patch({ showBib: !showBib })}
          />
          <Text id="setup-bib-hint" variant="note" tone="muted">
            Display bib numbers on the public schedule
          </Text>
        </Stack>

        <Stack gap="hairline">
          <Switch
            label="Live Leaderboard"
            aria-describedby="setup-live-hint"
            checked={perHeat}
            onChange={() => patch({ leaderboardVisibility: perHeat ? 'per_workout' : 'per_heat' })}
          />
          <Text id="setup-live-hint" variant="note" tone="muted">
            {perHeat
              ? 'Leaderboard updates after each completed heat'
              : 'Leaderboard only shows after a full workout is completed'}
          </Text>
        </Stack>

        <Field
          label="Scoring System"
          hint={highest
            ? 'Highest total wins. Each workout awards points by place.'
            : 'Lowest total wins. Each workout adds the athlete’s place: 1st adds 1, 2nd adds 2.'}
        >
          <Select
            value={scoringSystem}
            onChange={(e) => patch({ scoringSystem: e.target.value === 'points' ? 'points' : 'rank' })}
          >
            <option value="rank">Lowest score - point by rank</option>
            <option value="points">Highest score</option>
          </Select>
        </Field>

        {highest && (
          <>
            <Field label="1st Place Points">
              <Input
                type="number"
                min={1}
                max={POINTS_MAX}
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                onBlur={(e) => savePoints('pointsFirst', e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
            </Field>
            <Field
              label="Points Fewer Each Place"
              hint="2nd place gets this many fewer than 1st, 3rd this many fewer again. A workout can set its own in its settings."
            >
              <Input
                type="number"
                min={0}
                max={POINTS_MAX}
                value={step}
                onChange={(e) => setStep(e.target.value)}
                onBlur={(e) => savePoints('pointsStep', e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
            </Field>
            <Text variant="note" tone="muted">{scalePreview(pointsScale)}</Text>
          </>
        )}

        <Field label="Judge Screen Password" hint="Required to open the judge schedule. Admins are never prompted.">
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={(e) => savePassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          />
        </Field>

        <Field
          label="Judge Max Consecutive Heats"
          hint="Highlight violations and cap auto-assignment when a judge exceeds this many heats in a row."
        >
          <Input
            type="number"
            min={1}
            max={20}
            value={consecutive}
            onChange={(e) => setConsecutive(e.target.value)}
            onBlur={(e) => saveConsecutive(Number(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          />
        </Field>
      </Stack>
    </DataPanel>
  )
}
