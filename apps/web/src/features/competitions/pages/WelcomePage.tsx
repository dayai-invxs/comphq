import { useState } from 'react'
import {
  Button,
  EmptyState,
  Heading,
  Input,
  ListGroup,
  ListItem,
  Spinner,
  Stack,
  Switch,
  Text,
} from '@mond-design-system/react'
import { useCompetitions, type CompetitionSummary } from '@/api/competitions'
import { Centered } from '@/components/Centered/Centered'
import { ComphqLogo } from '@/components/ComphqLogo/ComphqLogo'
import { RouterAnchor } from '@/components/RouterAnchor'
import styles from './WelcomePage.module.css'

/**
 * Over: its last workout started before today (the viewer's today), so it
 * stays listed through its final day. One with no start times yet is still
 * being set up, so it counts as upcoming.
 */
export function isPastCompetition(c: CompetitionSummary, now = new Date()): boolean {
  if (c.lastStartMs == null) return false
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  return c.lastStartMs < startOfToday.getTime()
}

// v1: src/app/page.tsx. The list it reads is public and holds every
// competition on the install (defect 4); this screen is what that list is for.
// Only upcoming and running competitions show, unless "Show past
// competitions" is on — the search included.
export function WelcomePage() {
  const [search, setSearch] = useState('')
  const [showPast, setShowPast] = useState(false)
  const competitions = useCompetitions()
  const all = competitions.data ?? []

  const matches = (c: CompetitionSummary) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  const shown = showPast ? all : all.filter((c) => !isPastCompetition(c))
  const filtered = shown.filter(matches)
  // Hidden only because the switch is off: worth saying so.
  const pastMatches = showPast ? 0 : all.filter((c) => isPastCompetition(c) && matches(c)).length
  const showPastButton = <Button variant="secondary" onClick={() => setShowPast(true)}>Show past competitions</Button>

  return (
    <Centered>
      <Stack gap="section" className={styles.column}>
        <Stack gap="tight" align="center">
          <Heading level={1}>
            <span className={styles.logo}>
              <ComphqLogo variant="stacked" />
            </span>
          </Heading>
          <Text variant="meta" tone="muted">Competition management</Text>
        </Stack>

        {/* v1 started from an empty array and so told an install with
            competitions in it that it had none, until the fetch landed. A
            failed read is the same lie by another route. */}
        {competitions.error ? (
          <EmptyState title="Could not load the competitions" description={competitions.error.message} />
        ) : competitions.isPending ? (
          /* A spinner rather than a skeleton: what lands is a search input
             and a list, not text lines, and this centered column has no
             surrounding layout a skeleton would hold steady. */
          <Centered>
            <Spinner label="Loading competitions" />
          </Centered>
        ) : all.length === 0 ? (
          <EmptyState
            title="No competitions yet"
            description="A competition appears here once someone has created one."
          />
        ) : (
          <Stack gap="base">
            <Input
              type="search"
              aria-label="Search competitions"
              placeholder="Search competitions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              clearLabel="Clear search"
              onClear={() => setSearch('')}
              autoFocus
            />
            <Switch
              label="Show past competitions"
              checked={showPast}
              onChange={(e) => setShowPast(e.target.checked)}
            />
            {filtered.length === 0 && !search && pastMatches > 0 ? (
              <EmptyState
                title="No upcoming competitions"
                description="Past competitions are hidden."
                action={showPastButton}
              />
            ) : filtered.length === 0 && pastMatches > 0 ? (
              <EmptyState
                title="No upcoming competition by that name"
                description={pastMatches === 1 ? 'A past competition matches.' : `${pastMatches} past competitions match.`}
                action={showPastButton}
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                title="No competition by that name"
                description="Search the address on the flyer instead — that is the slug."
                action={<Button variant="secondary" onClick={() => setSearch('')}>Show them all</Button>}
              />
            ) : (
              <ListGroup aria-label="Competitions">
                {filtered.map((c) => (
                  <ListItem
                    key={c.id}
                    as={RouterAnchor}
                    href={`/${c.slug}`}
                    title={c.name}
                    description={`comphq.pro/${c.slug}`}
                  />
                ))}
              </ListGroup>
            )}
          </Stack>
        )}
      </Stack>
    </Centered>
  )
}
