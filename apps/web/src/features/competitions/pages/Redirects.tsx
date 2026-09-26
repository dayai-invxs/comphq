import { Navigate, useParams } from 'react-router'
import { Spinner } from '@mond-design-system/react'
import { useCompetitions } from '@/api/competitions'
import { Centered } from '@/components/Centered/Centered'

// v1: src/app/ops/page.tsx, src/app/control/page.tsx, src/app/[slug]/ops/page.tsx.
// Three server components whose whole body was a redirect.

/** v1's getCompetitionSlug(): whichever competition the database hands back
    first. The public list is ordered by id, so this picks the same one every
    time — v1's unordered `limit 1` did not promise that. */
export function FirstCompetitionRedirect({ page }: { page: string }) {
  const competitions = useCompetitions()
  if (competitions.isPending) {
    return <Centered><Spinner label="Finding a competition" /></Centered>
  }
  // No competition, or no answer: v1 sent the operator to the picker either way.
  const slug = competitions.data?.[0]?.slug
  return <Navigate to={slug ? `/${slug}/${page}` : '/'} replace />
}

/** A page that moved. The slug is already in the URL, so nothing is fetched. */
export function SlugRedirect({ page }: { page: string }) {
  const { slug } = useParams()
  return <Navigate to={`/${slug}/${page}`} replace />
}
