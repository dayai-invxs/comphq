import { notFound } from 'next/navigation'
import { resolveCompetition } from '@/lib/competition'
import OpsView from '@/components/OpsView'

export default async function AthleteOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const competition = await resolveCompetition(slug)
  if (!competition) notFound()
  return <OpsView slug={slug} />
}
