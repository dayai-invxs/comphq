import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { supabase } from '@/lib/supabase'

const BUCKET = 'logos'
const LOGO_KEY = 'logoUrl'

export async function GET() {
  const row = await prisma.setting.findUnique({ where: { key: LOGO_KEY } })
  return Response.json({ url: row?.value ?? null })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const formData = await req.formData()
  const file = formData.get('logo') as File | null
  if (!file) return new Response('No file', { status: 400 })

  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
  if (!allowedTypes.includes(file.type)) {
    return new Response('Invalid file type', { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const filename = `competition-logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: file.type, upsert: true })

  if (error) return new Response(error.message, { status: 500 })

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)

  await prisma.setting.upsert({
    where: { key: LOGO_KEY },
    update: { value: data.publicUrl },
    create: { key: LOGO_KEY, value: data.publicUrl },
  })

  return Response.json({ url: data.publicUrl })
}

export async function DELETE(_req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const row = await prisma.setting.findUnique({ where: { key: LOGO_KEY } })
  if (row) {
    const filename = row.value.split('/').pop()!
    await supabase.storage.from(BUCKET).remove([filename])
    await prisma.setting.delete({ where: { key: LOGO_KEY } })
  }

  return Response.json({ url: null })
}
