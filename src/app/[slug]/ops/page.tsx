import { redirect } from 'next/navigation'

export default async function OpsLegacyRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/${slug}/athlete-overview`)
}
