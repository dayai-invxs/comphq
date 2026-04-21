import { redirect } from 'next/navigation'
import { getCompetitionSlug } from '@/lib/competition'

export default async function AthleteControlRedirect() {
  const slug = await getCompetitionSlug()
  if (slug) redirect(`/${slug}/athlete-control`)
  redirect('/')
}
