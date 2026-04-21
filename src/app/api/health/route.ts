import { supabase } from '@/lib/supabase'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET() {
  const { error } = await supabase.from('Competition').select('id').limit(1)
  if (error) {
    return Response.json({ status: 'error', message: error.message }, { status: 503, headers: NO_CACHE })
  }
  return Response.json({ status: 'ok', ts: new Date().toISOString() }, { status: 200, headers: NO_CACHE })
}
