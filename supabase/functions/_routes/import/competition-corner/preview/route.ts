import { db } from '@/lib/db'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { diffPlan } from '@/lib/competitionCorner/diff'
import { changesVersion, ImportRequest, loadPlan } from '@/lib/competitionCorner/source'
import { loadCurrent } from '@/lib/competitionCorner/store'

/** Reads the event and lists what importing it would change. Writes nothing. */
export async function POST(req: Request) {
  const parsed = await parseJson(req, ImportRequest)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAdmin(parsed.data.slug)
    const [loaded, current] = await Promise.all([loadPlan(parsed.data), loadCurrent(db, competition.id)])
    if (!loaded.ok) return loaded.response

    const changes = diffPlan(loaded.plan, current)
    return Response.json({ event: loaded.event, changes, version: await changesVersion(changes) })
  } catch (e) {
    return authErrorResponse(e)
  }
}
