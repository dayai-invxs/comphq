import { cache } from 'react'
import { supabase } from '@/lib/supabase'

type Competition = { id: number; name: string; slug: string }

export const resolveCompetition = cache(async (slug: string): Promise<Competition | null> => {
  if (!slug) return null
  const { data } = await supabase.from('Competition').select('*').eq('slug', slug).maybeSingle()
  return (data as Competition | null)
})

export async function getCompetitionSlug(): Promise<string> {
  const { data } = await supabase.from('Competition').select('slug').limit(1).maybeSingle()
  return (data as { slug?: string } | null)?.slug ?? ''
}
