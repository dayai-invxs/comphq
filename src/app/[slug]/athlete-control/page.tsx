import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveCompetition } from '@/lib/competition'
import AthleteControl from '@/components/AthleteControl'

export default async function AthleteControlPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { slug } = await params
  const competition = await resolveCompetition(slug)
  if (!competition) notFound()
  return <AthleteControl slug={slug} />
}
