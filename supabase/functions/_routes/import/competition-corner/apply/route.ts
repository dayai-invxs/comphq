import { z } from 'zod'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { ScoreType } from '@/lib/schemas'
import { diffPlan } from '@/lib/competitionCorner/diff'
import { changesVersion, ImportRequest, loadPlan } from '@/lib/competitionCorner/source'
import { executeWrites, loadCurrent } from '@/lib/competitionCorner/store'
import { planWrites } from '@/lib/competitionCorner/writes'

const ApplyRequest = ImportRequest.extend({
  /** The preview's version; a mismatch means the source or the competition moved since. */
  version: z.string(),
  accepted: z.array(z.string()).min(1),
  scoreTypes: z.record(z.string(), ScoreType).default({}),
})

/**
 * Writes the changes the admin accepted. The event is read again and the
 * diff rebuilt inside the transaction, so nothing is written against a
 * preview that no longer holds.
 */
export async function POST(req: Request) {
  const parsed = await parseJson(req, ApplyRequest)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    const { user, competition } = await requireCompetitionAdmin(body.slug)
    const loaded = await loadPlan(body)
    if (!loaded.ok) return loaded.response

    const response = await db.transaction(async (tx) => {
      const current = await loadCurrent(tx, competition.id)
      const changes = diffPlan(loaded.plan, current)
      if (await changesVersion(changes) !== body.version) {
        return new Response('The event or this competition changed since the preview. Preview again.', { status: 409 })
      }
      const planned = planWrites(loaded.plan, current, changes, { accepted: body.accepted, scoreTypes: body.scoreTypes })
      if (!planned.ok) return Response.json({ errors: planned.errors }, { status: 400 })

      await executeWrites(tx, competition.id, loaded.event.id, planned.writes)
      return null
    })
    if (response) return response

    await logAudit(user, {
      action: 'competition_corner.import',
      resource: { type: 'competition', id: competition.id, competitionId: competition.id },
      diff: { eventId: loaded.event.id, accepted: body.accepted },
    })
    return Response.json({ applied: body.accepted.length })
  } catch (e) {
    return authErrorResponse(e)
  }
}
