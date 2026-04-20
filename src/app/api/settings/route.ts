import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'

async function getSetting(key: string, defaultValue: string): Promise<string> {
  const [row] = await sql`SELECT value FROM "Setting" WHERE key = ${key}`
  return (row?.value as string) ?? defaultValue
}

export async function GET() {
  const showBib = await getSetting('showBib', 'true')
  return Response.json({ showBib: showBib !== 'false' })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  if (body.showBib !== undefined) {
    await sql`
      INSERT INTO "Setting" (key, value) VALUES ('showBib', ${String(Boolean(body.showBib))})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `
  }

  const showBib = await getSetting('showBib', 'true')
  return Response.json({ showBib: showBib !== 'false' })
}
