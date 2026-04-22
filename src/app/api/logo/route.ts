import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireSession } from '@/lib/auth-competition'

const BUCKET = 'logos'
const LOGO_KEY = 'logoUrl'
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

// Server-controlled extension map — never trust the upload filename.
// image/svg+xml is intentionally excluded (script-execution vector).
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export async function GET() {
  const { data } = await supabase.from('Setting').select('value').eq('key', LOGO_KEY).maybeSingle()
  return Response.json({ url: (data as { value?: string } | null)?.value ?? null })
}

export async function POST(req: Request) {
  try { await requireSession() } catch (e) { return authErrorResponse(e) }

  const formData = await req.formData()
  const file = formData.get('logo') as File | null
  if (!file) return new Response('No file', { status: 400 })

  const ext = MIME_TO_EXT[file.type]
  if (!ext) return new Response('Invalid file type', { status: 400 })

  if (file.size > MAX_BYTES) {
    return new Response(`File too large (max ${MAX_BYTES / 1024 / 1024} MB)`, { status: 413 })
  }

  const filename = `competition-logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
    contentType: file.type,
    upsert: true,
  })
  if (error) return new Response(error.message, { status: 500 })

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  await supabase
    .from('Setting')
    .upsert({ key: LOGO_KEY, value: data.publicUrl }, { onConflict: 'key' })

  return Response.json({ url: data.publicUrl })
}

export async function DELETE() {
  try { await requireSession() } catch (e) { return authErrorResponse(e) }

  const { data: row } = await supabase.from('Setting').select('value').eq('key', LOGO_KEY).maybeSingle()
  if (row) {
    const filename = ((row as { value: string }).value).split('/').pop()!
    await supabase.storage.from(BUCKET).remove([filename])
    await supabase.from('Setting').delete().eq('key', LOGO_KEY)
  }
  return Response.json({ url: null })
}
