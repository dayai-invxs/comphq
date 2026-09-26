import {
  Badge,
  Button,
  Checkbox,
  Chip,
  Divider,
  EmptyState,
  Field,
  Heading,
  Inline,
  Input,
  ProgressBar,
  Radio,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
  Stack,
  Switch,
  Tag,
  Text,
  Textarea,
  Tooltip,
} from '@mond-design-system/react'
import { useState } from 'react'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { Glyph, type GlyphName } from '@/components/Glyph/Glyph'
import { LiveBadge } from '@/components/LiveBadge/LiveBadge'
import { NowStrip } from '@/components/NowStrip/NowStrip'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import styles from './StyleguidePage.module.css'
import swatches from './swatches.module.css'

// The whole design language on one page, so it can be reviewed before it is
// spread across 24 screens. Dev-only — routes.tsx adds it under
// import.meta.env.DEV and the production bundle never sees it.

const PALETTE: { group: string; tokens: string[] }[] = [
  { group: 'Surfaces', tokens: ['surface-page', 'surface-card', 'surface-raised', 'surface-sunken', 'surface-selected', 'surface-media', 'surface-inverse'] },
  { group: 'Text', tokens: ['text-primary', 'text-secondary', 'text-muted', 'text-accent', 'text-inverse', 'text-on-media'] },
  { group: 'Borders', tokens: ['border-subtle', 'border-strong', 'control-border', 'button-border', 'control-knob'] },
  { group: 'Accent — interactive', tokens: ['accent', 'accent-hover', 'accent-soft', 'accent-contrast', 'action-bg', 'action-bg-hover', 'action-bg-active', 'action-fg', 'action-disabled-bg', 'action-disabled-fg', 'focus-ring-color'] },
  { group: 'Highlight — live now', tokens: ['highlight', 'highlight-hover', 'highlight-soft', 'highlight-contrast'] },
  { group: 'Status — outcome', tokens: ['status-success', 'status-success-soft', 'status-warning', 'status-warning-soft', 'status-danger', 'status-danger-soft'] },
  { group: 'Avatars', tokens: ['avatar-tone-1', 'avatar-tone-2', 'avatar-tone-3', 'avatar-tone-4', 'avatar-tone-5'] },
  { group: 'Over media', tokens: ['scrim', 'scrim-strong', 'overlay', 'on-media-dim', 'on-media-border', 'on-media-focus-ring', 'on-media-surface-hover', 'on-media-surface-active'] },
]

const COLOUR_RULE: [string, string][] = [
  ['Emerald', 'Brand and interactive. Logo, links, buttons, focus — anything the hand acts on.'],
  ['Amber', 'Live now. The running heat, the current lane, the countdown. Nothing else.'],
  ['Neutral', 'Data. Names, lanes, times and standings are not coloured.'],
  ['Status', 'Outcome. Danger, warning, success, and nothing else.'],
]

const TYPE: [string, string][] = [
  ['display', 'Rugged Rumble'],
  ['title', 'Competition Schedule'],
  ['subtitle', 'Heat Assignments'],
  ['item-title', 'Alice Adams'],
  ['label', 'Lane 3'],
  ['body', 'The best athletes are placed in the last heat.'],
  ['meta', 'Updated 12 seconds ago'],
  ['eyebrow', 'Workout 3'],
  ['code', '4:12.08'],
]

const GLYPHS: GlyphName[] = [
  'schedule', 'leaderboard', 'athletes', 'more', 'dashboard', 'workouts',
  'people', 'judges', 'equipment', 'control', 'setup', 'users', 'back',
]

const startMs = Date.parse('2026-08-27T15:00:00.000Z')

const sampleNow = {
  workout: {
    id: 1, number: 3, name: 'Helen', status: 'active', locationName: 'Main floor',
    startTime: '2026-08-27T15:00:00.000Z', heatIntervalSecs: 600, timeBetweenHeatsSecs: 0,
    callTimeSecs: 600, walkoutTimeSecs: 120, heatStartOverrides: {}, heats: [],
  },
  heat: { heatNumber: 3, isComplete: false, entries: [] },
  startMs,
  corralMs: startMs - 600_000,
  walkoutMs: startMs - 120_000,
  divisions: ['Rx', 'Scaled'],
}

export function StyleguidePage() {
  const [checked, setChecked] = useState(true)
  const [segment, setSegment] = useState('rx')

  return (
    <PageFrame
      title="Design language"
      eyebrow="CompHQ"
      description="Every token and every primitive, drawn against the CompHQ brand palette."
      wide
    >
      <DataPanel title="The colour rule" description="Colour carries meaning here, not decoration.">
        <div className={styles.rules}>
          {COLOUR_RULE.map(([key, meaning]) => (
            <div key={key} className={styles.rule}>
              <span className={styles.ruleKey}>{key}</span>
              <Text variant="meta" tone="muted">{meaning}</Text>
            </div>
          ))}
        </div>
      </DataPanel>

      {PALETTE.map(({ group, tokens }) => (
        <DataPanel key={group} title={group}>
          <div className={styles.swatches}>
            {tokens.map((token) => (
              <div key={token} className={styles.swatch}>
                <div className={`${styles.chip} ${swatches[`sw-${token}`]}`} />
                <span className={styles.name}>--mds-{token}</span>
              </div>
            ))}
          </div>
        </DataPanel>
      ))}

      <DataPanel title="Type">
        <div className={styles.scale}>
          {TYPE.map(([variant, sample]) => (
            <div key={variant}>
              <span className={styles.name}>{variant}</span>
              <Text variant={variant as never}>{sample}</Text>
            </div>
          ))}
        </div>
      </DataPanel>

      <DataPanel title="Headings">
        <Stack gap="tight">
          <Heading level={2} variant="display">Display</Heading>
          <Heading level={2} variant="title">Title</Heading>
          <Heading level={2} variant="subtitle">Subtitle</Heading>
          <Heading level={2} variant="label">Label</Heading>
        </Stack>
      </DataPanel>

      <DataPanel title="Buttons" description="Emerald is the only interactive colour.">
        <Stack gap="base">
          <Inline gap="tight" wrap>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="warning">Warning</Button>
            <Button variant="highlight">Highlight</Button>
          </Inline>
          <Inline gap="tight" wrap>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <Button iconOnly aria-label="Back"><Glyph name="back" /></Button>
          </Inline>
        </Stack>
      </DataPanel>

      <DataPanel title="Controls">
        <Stack gap="base">
          <Field label="Athlete name"><Input placeholder="Alice Adams" /></Field>
          <Field label="Division">
            <Select>
              <option>Rx</option>
              <option>Scaled</option>
            </Select>
          </Field>
          <Field label="Notes"><Textarea rows={2} /></Field>
          <Checkbox label="Show bib numbers" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <Radio name="sg" label="Lowest score wins" defaultChecked />
          <Radio name="sg" label="Highest score wins" />
          <Switch label="Live leaderboard" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <SegmentedControl
            label="Division"
            value={segment}
            onChange={setSegment}
            options={[{ value: 'rx', label: 'Rx' }, { value: 'scaled', label: 'Scaled' }]}
          />
        </Stack>
      </DataPanel>

      <DataPanel title="Status and marks">
        <Stack gap="base">
          <Inline gap="tight" wrap>
            <LiveBadge>Now</LiveBadge>
            <LiveBadge compact>Heat 3</LiveBadge>
            <Badge tone="accent">super</Badge>
            <Badge tone="success">complete</Badge>
            <Badge tone="danger">DNS</Badge>
            <Tag>Rugged Rumble</Tag>
            <Chip>Rx</Chip>
            <Chip variant="outline">Scaled</Chip>
            <Tooltip content="Called to the corral"><Button variant="ghost" size="sm">Corral</Button></Tooltip>
          </Inline>
          <ProgressBar value={62} label="Heats complete" />
          <Divider />
          <Inline gap="base" align="center">
            <Spinner label="Loading" />
            <Text variant="meta" tone="muted">Spinner — only where nothing can be shaped yet.</Text>
          </Inline>
        </Stack>
      </DataPanel>

      <DataPanel
        title="Waiting and nothing"
        description="Skeleton while pending, EmptyState when empty. Never a bare sentence."
      >
        <Stack gap="base">
          <Stack gap="tight">
            <Skeleton variant="text" lines={3} />
            <Skeleton variant="rect" height="var(--mds-avatar-lg)" />
          </Stack>
          <Divider />
          <EmptyState
            title="No athletes yet"
            description="Add the roster and heats can be seeded."
            icon={<Glyph name="athletes" />}
            action={<Button>Add athlete</Button>}
          />
        </Stack>
      </DataPanel>

      <DataPanel title="Now" description="The one place amber is a surface.">
        <NowStrip now={sampleNow} />
      </DataPanel>

      <DataPanel title="Panels" description="One elevation per screen. A panel never contains a panel.">
        <DataPanel tone="sunken" title="Nested" description="Loses its surface rather than stacking a third box.">
          <Text variant="meta" tone="muted">Rows go here.</Text>
        </DataPanel>
      </DataPanel>

      <DataPanel title="Glyphs">
        <div className={styles.glyphs}>
          {GLYPHS.map((name) => (
            <div key={name} className={styles.glyph}>
              <Glyph name={name} />
              <span className={styles.name}>{name}</span>
            </div>
          ))}
        </div>
      </DataPanel>
    </PageFrame>
  )
}
