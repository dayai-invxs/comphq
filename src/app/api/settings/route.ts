import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

async function getSetting(key: string, defaultValue: string): Promise<string> {
  const { data } = await supabase.from('Setting').select('value').eq('key', key).maybeSingle()
  return (data as { value?: string } | null)?.value ?? defaultValue
}

export async function GET() {
  const showBib = await getSetting('showBib', 'true')
  return Response.json({ showBib: showBib !== 'false' })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const body = await req.json() as { showBib?: boolean }
  if (body.showBib !== undefined) {
    await supabase
      .from('Setting')
      .upsert({ key: 'showBib', value: String(Boolean(body.showBib)) }, { onConflict: 'key' })
  }

  const showBib = await getSetting('showBib', 'true')
  return Response.json({ showBib: showBib !== 'false' })
}
