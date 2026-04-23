import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { resolveCompetition } from '@/lib/competition'
import JudgeScheduleView from '@/components/JudgeScheduleView'

export default async function JudgesPage({ params }: { params: Promise<{ slug: string }> }) {
  const client = await createSupabaseServerClient()
  const { data: { user } } = await client.auth.getUser()
  const { slug } = await params
  if (!user) redirect(`/login?callbackUrl=/${slug}/judges`)

  const competition = await resolveCompetition(slug)
  if (!competition) notFound()

  return <JudgeScheduleView slug={slug} />
}
