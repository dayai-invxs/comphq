import { notFound } from 'next/navigation'
import { resolveCompetition } from '@/lib/competition'
import JudgeScheduleView from '@/components/JudgeScheduleView'

export default async function JudgesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const competition = await resolveCompetition(slug)
  if (!competition) notFound()

  return <JudgeScheduleView slug={slug} />
}
