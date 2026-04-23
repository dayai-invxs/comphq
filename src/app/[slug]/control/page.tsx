import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { resolveCompetition } from '@/lib/competition'
import AthleteControl from '@/components/AthleteControl'

export default async function AthleteControlPage({ params }: { params: Promise<{ slug: string }> }) {
  const client = await createSupabaseServerClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')

  const { slug } = await params
  const competition = await resolveCompetition(slug)
  if (!competition) notFound()
  return <AthleteControl slug={slug} />
}
