import { db } from '@/lib/db'
import { competition } from '@/db/schema'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET() {
  try {
    await db.select({ id: competition.id }).from(competition).limit(1)
    return Response.json({ status: 'ok', ts: new Date().toISOString() }, { status: 200, headers: NO_CACHE })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ status: 'error', message }, { status: 503, headers: NO_CACHE })
  }
}
