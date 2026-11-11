import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { setting } from '@/db/schema'
import { supabase } from '@/lib/supabase'
import { resolveCompetition } from '@/lib/competition'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'

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

// Each competition has its own logo, kept in its Setting rows and stored at
// logos/<competitionId>/logo.<ext>. There used to be one logo for the whole
// site, set from any competition's Setup page by anyone signed in, so one
// competition's upload replaced every other competition's mark.
//
// The stored URL carries ?v=<upload time>: a replacement keeps the same file
// name, and a new address is what makes browsers and the storage CDN fetch it
// rather than serve the old copy.

const slugOf = (req: Request) => new URL(req.url).searchParams.get('slug') ?? ''

async function readLogoUrl(competitionId: number): Promise<string | null> {
  const rows = await db
    .select({ value: setting.value })
    .from(setting)
    .where(and(eq(setting.competitionId, competitionId), eq(setting.key, LOGO_KEY)))
    .limit(1)
  return rows[0]?.value ?? null
}

/** The object's path in the bucket, from its public URL, without the ?v= stamp. */
function storagePath(url: string): string | null {
  try {
    const { pathname } = new URL(url)
    const marker = `/${BUCKET}/`
    const at = pathname.indexOf(marker)
    return at < 0 ? null : decodeURIComponent(pathname.slice(at + marker.length))
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const competition = await resolveCompetition(slugOf(req))
  if (!competition) return Response.json({ url: null })
  return Response.json({ url: await readLogoUrl(competition.id) })
}

export async function POST(req: Request) {
  let competitionId: number
  try {
    ({ competition: { id: competitionId } } = await requireCompetitionAdmin(slugOf(req)))
  } catch (e) {
    return authErrorResponse(e)
  }

  const formData = await req.formData()
  const file = formData.get('logo') as File | null
  if (!file) return new Response('No file', { status: 400 })

  const ext = MIME_TO_EXT[file.type]
  if (!ext) return new Response('Invalid file type', { status: 400 })

  if (file.size > MAX_BYTES) {
    return new Response(`File too large (max ${MAX_BYTES / 1024 / 1024} MB)`, { status: 413 })
  }

  const path = `${competitionId}/logo.${ext}`
  // Plain bytes: Buffer is Node's, and the functions run on Deno, where it
  // is not defined — the upload failed with "Buffer is not defined".
  const bytes = new Uint8Array(await file.arrayBuffer())

  const previous = await readLogoUrl(competitionId)

  // Storage stays on supabase-js — Drizzle doesn't own blob storage.
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  })
  if (error) return new Response(error.message, { status: 500 })

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const url = `${data.publicUrl}?v=${Date.now()}`
  await db
    .insert(setting)
    .values({ competitionId, key: LOGO_KEY, value: url })
    .onConflictDoUpdate({
      target: [setting.competitionId, setting.key],
      set: { value: url },
    })

  // A PNG replaced by a JPG leaves the PNG behind under another name.
  const old = previous ? storagePath(previous) : null
  if (old && old !== path) await supabase.storage.from(BUCKET).remove([old])

  return Response.json({ url })
}

export async function DELETE(req: Request) {
  let competitionId: number
  try {
    ({ competition: { id: competitionId } } = await requireCompetitionAdmin(slugOf(req)))
  } catch (e) {
    return authErrorResponse(e)
  }

  const value = await readLogoUrl(competitionId)
  if (value) {
    const path = storagePath(value)
    if (path) await supabase.storage.from(BUCKET).remove([path])
    await db.delete(setting).where(and(eq(setting.competitionId, competitionId), eq(setting.key, LOGO_KEY)))
  }
  return Response.json({ url: null })
}
