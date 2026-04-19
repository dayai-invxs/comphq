import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'settings.json')
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')

function readSettings(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function writeSettings(data: Record<string, string>) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true })
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2))
}

export async function GET() {
  const settings = readSettings()
  if (!settings.logoFile) return Response.json({ url: null })
  const filePath = path.join(UPLOADS_DIR, settings.logoFile)
  if (!fs.existsSync(filePath)) return Response.json({ url: null })
  return Response.json({ url: `/uploads/${settings.logoFile}` })
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

  fs.mkdirSync(UPLOADS_DIR, { recursive: true })

  // Remove any old logo files with different extensions
  const settings = readSettings()
  if (settings.logoFile && settings.logoFile !== filename) {
    const oldPath = path.join(UPLOADS_DIR, settings.logoFile)
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer)

  writeSettings({ ...settings, logoFile: filename })

  return Response.json({ url: `/uploads/${filename}` })
}

export async function DELETE(_req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const settings = readSettings()
  if (settings.logoFile) {
    const filePath = path.join(UPLOADS_DIR, settings.logoFile)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    const { logoFile: _, ...rest } = settings
    writeSettings(rest)
  }
  return Response.json({ url: null })
}
