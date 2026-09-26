import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { siteSetting } from '@/db/schema'
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

// The logo is site-wide, so it lives in SiteSetting. v1 kept it in Setting
// under competitionId 0; this schema's FK to Competition refuses that row.

async function readLogoUrl(): Promise<string | null> {
  const rows = await db
    .select({ value: siteSetting.value })
    .from(siteSetting)
    .where(eq(siteSetting.key, LOGO_KEY))
    .limit(1)
  return rows[0]?.value ?? null
}

export async function GET() {
  const url = await readLogoUrl()
  return Response.json({ url })
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

  // Storage stays on supabase-js — Drizzle doesn't own blob storage.
  const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
    contentType: file.type,
    upsert: true,
  })
  if (error) return new Response(error.message, { status: 500 })

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  await db
    .insert(siteSetting)
    .values({ key: LOGO_KEY, value: data.publicUrl })
    .onConflictDoUpdate({
      target: siteSetting.key,
      set: { value: data.publicUrl },
    })

  return Response.json({ url: data.publicUrl })
}

export async function DELETE() {
  try { await requireSession() } catch (e) { return authErrorResponse(e) }

  const value = await readLogoUrl()
  if (value) {
    const filename = value.split('/').pop()!
    await supabase.storage.from(BUCKET).remove([filename])
    await db.delete(siteSetting).where(eq(siteSetting.key, LOGO_KEY))
  }
  return Response.json({ url: null })
}
