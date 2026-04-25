import { notFound } from 'next/navigation'
import { resolveCompetition } from '@/lib/competition'
import EquipmentControlView from '@/components/EquipmentControlView'

export default async function EquipmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const competition = await resolveCompetition(slug)
  if (!competition) notFound()
  return <EquipmentControlView slug={slug} />
}
