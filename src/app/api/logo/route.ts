import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { sql } from '@/lib/db'

const BUCKET = 'logos'
const LOGO_KEY = 'logoUrl'

export async function GET() {
  const [row] = await sql`SELECT value FROM "Setting" WHERE key = ${LOGO_KEY}`
  return Response.json({ url: (row?.value as string) ?? null })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const formData = await req.formData()
  const file = formData.get('logo') as File | null
  if (!file) return new Response('No file', { status: 400 })

  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
  if (!allowedTypes.includes(file.type)) return new Response('Invalid file type', { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const filename = `competition-logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, { contentType: file.type, upsert: true })
  if (error) return new Response(error.message, { status: 500 })

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  await sql`
    INSERT INTO "Setting" (key, value) VALUES (${LOGO_KEY}, ${data.publicUrl})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `
  return Response.json({ url: data.publicUrl })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const [row] = await sql`SELECT value FROM "Setting" WHERE key = ${LOGO_KEY}`
  if (row) {
    const filename = (row.value as string).split('/').pop()!
    await supabase.storage.from(BUCKET).remove([filename])
    await sql`DELETE FROM "Setting" WHERE key = ${LOGO_KEY}`
  }
  return Response.json({ url: null })
}
