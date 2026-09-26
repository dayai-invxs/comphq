import { EmptyState, Spinner } from '@mond-design-system/react'
import { useParams } from 'react-router'
import type { ReactNode } from 'react'
import { useCompetitions } from '@/api/competitions'
import { Centered } from '@/components/Centered/Centered'

// v1's public pages were server components that called resolveCompetition(slug)
// and notFound() when it came back null — five of the six did, and the
// leaderboard did not, which is v1's own asymmetry and is kept.
//
// There is no server render to do it in here, and no endpoint that resolves a
// slug on its own, so it is the public competition list — the same list v1
// serves to anyone (defect 4) and the admin gate already reads.
export function RequireCompetition({ children }: { children: ReactNode }) {
  const { slug } = useParams()
  const competitions = useCompetitions()

  if (competitions.isPending) {
    return <Centered><Spinner label="Loading" /></Centered>
  }

  if (!competitions.data?.some((c) => c.slug === slug)) {
    return (
      <Centered>
        <EmptyState title="404" description="This page could not be found." />
      </Centered>
    )
  }

  return <>{children}</>
}
