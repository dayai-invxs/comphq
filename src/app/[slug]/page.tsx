import { notFound } from 'next/navigation'
import { resolveCompetition } from '@/lib/competition'
import PublicSchedule from '@/components/PublicSchedule'

export default async function CompetitionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const competition = await resolveCompetition(slug)
  if (!competition) notFound()
  return <PublicSchedule slug={slug} />
}
