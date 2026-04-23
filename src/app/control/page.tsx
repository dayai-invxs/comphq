import { redirect } from 'next/navigation'
import { getCompetitionSlug } from '@/lib/competition'

// Needs a live DB read to pick a slug — cannot be statically prerendered.
export const dynamic = 'force-dynamic'

export default async function AthleteControlRedirect() {
  const slug = await getCompetitionSlug()
  if (slug) redirect(`/${slug}/control`)
  redirect('/')
}
