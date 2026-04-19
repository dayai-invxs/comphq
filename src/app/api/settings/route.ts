import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function getSetting(key: string, defaultValue: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } })
  return row?.value ?? defaultValue
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
    await prisma.setting.upsert({
      where: { key: 'showBib' },
      update: { value: String(Boolean(body.showBib)) },
      create: { key: 'showBib', value: String(Boolean(body.showBib)) },
    })
  }

  const showBib = await getSetting('showBib', 'true')
  return Response.json({ showBib: showBib !== 'false' })
}
