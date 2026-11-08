import { EmptyState, Spinner } from '@mond-design-system/react'
import { useParams } from 'react-router'
import type { ReactNode } from 'react'
import { useSettings } from '@/api/settings'
import { Centered } from '@/components/Centered/Centered'

// v1's public pages were server components that called resolveCompetition(slug)
// and notFound() when it came back null — five of the six did, and the
// leaderboard did not, which is v1's own asymmetry and is kept.
//
// There is no server render to do it in here. The slug is resolved by its
// settings, which answer 404 for a slug that is no competition. Not by the
// public competition list: an unlisted competition is left out of that list
// and still opens for anyone with its link. The pages behind this gate read
// the same settings query, so it is one request either way.
export function RequireCompetition({ children }: { children: ReactNode }) {
  const { slug = '' } = useParams()
  const settings = useSettings(slug)

  if (slug && settings.isPending) {
    return <Centered><Spinner label="Loading" /></Centered>
  }

  if (!settings.data) {
    return (
      <Centered>
        <EmptyState title="404" description="This page could not be found." />
      </Centered>
    )
  }

  return <>{children}</>
}
