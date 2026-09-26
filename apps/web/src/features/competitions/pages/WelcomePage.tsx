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
  Text,
} from '@mond-design-system/react'
import { useCompetitions } from '@/api/competitions'
import { Centered } from '@/components/Centered/Centered'
import { ComphqLogo } from '@/components/ComphqLogo/ComphqLogo'
import { RouterAnchor } from '@/components/RouterAnchor'
import styles from './WelcomePage.module.css'

// v1: src/app/page.tsx. The list it reads is public and holds every
// competition on the install (defect 4); this screen is what that list is for.
export function WelcomePage() {
  const [search, setSearch] = useState('')
  const competitions = useCompetitions()
  const all = competitions.data ?? []

  const filtered = all.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  )

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
            {filtered.length === 0 ? (
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
