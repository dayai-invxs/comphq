import { redirect } from 'next/navigation'
import { getCompetitionSlug } from '@/lib/competition'

export default async function OpsRedirect() {
  const slug = await getCompetitionSlug()
  if (slug) redirect(`/${slug}/ops`)
  redirect('/')
}
