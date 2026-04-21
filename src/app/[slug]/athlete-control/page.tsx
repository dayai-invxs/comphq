import { notFound } from 'next/navigation'
import { resolveCompetition } from '@/lib/competition'
import AthleteControl from '@/components/AthleteControl'

export default async function AthleteControlPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const competition = await resolveCompetition(slug)
  if (!competition) notFound()
  return <AthleteControl slug={slug} />
}
