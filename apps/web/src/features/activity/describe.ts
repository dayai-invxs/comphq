import type { ActivityEntry, ActivityNames } from '@/api/activity'
import { formatScore } from '@/lib/scoreFormat'

// One line of the audit trail in words. The server keeps each change as the
// route it went to and the body it carried (supabase/functions/_shared/
// auditTrail.ts); this turns that back into "Saved Ada's score in Event 1 -
// Fran: 3:01".
//
// A change this does not know reads as its route, which is still enough to
// tell what happened, so a route added later is never invisible here.

type Body = Record<string, unknown>

export function describe(entry: ActivityEntry, names: ActivityNames): string {
  const params = entry.diff?.params ?? {}
  const raw = entry.diff?.body
  const body: Body = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Body) : {}

  const wk = names.workouts.find((w) => String(w.id) === params.id)
  const workoutName = wk ? `Event ${wk.number} - ${wk.name}` : params.id ? `workout #${params.id}` : 'a workout'
  const athleteName = (id: unknown) => {
    const a = names.athletes.find((x) => x.id === Number(id))
    return a ? a.name : `athlete #${String(id)}`
  }
  const heat = params.heatNum ? `heat ${params.heatNum}` : 'a heat'
  const athleteParam = params.id ? athleteName(params.id) : 'an athlete'

  switch (entry.action) {
    case 'POST /workouts/:id/scores': {
      const who = athleteName(body.athleteId)
      if (Array.isArray(body.lanes)) return `Saved ${who}'s lane scores in ${workoutName}`
      const score = typeof body.rawScore === 'number' && wk
        ? `: ${formatScore(body.rawScore, wk.scoreType, body.capped === true)}`
        : ''
      return `Saved ${who}'s score in ${workoutName}${score}`
    }
    case 'PATCH /workouts/:id/scores':
      return `Changed ${athleteName(body.athleteId)}'s placing in ${workoutName} to ${String(body.points)}`
    case 'DELETE /workouts/:id/scores': return `Cleared every score in ${workoutName}`
    case 'POST /workouts/:id/calculate': return `Calculated the rankings for ${workoutName}`
    case 'POST /workouts/:id/heats/:heatNum/complete': return `Completed ${heat} of ${workoutName}`
    case 'DELETE /workouts/:id/heats/:heatNum/complete': return `Reopened ${heat} of ${workoutName}`
    case 'DELETE /workouts/:id/heats/:heatNum': return `Deleted ${heat} of ${workoutName}`
    case 'POST /workouts/:id/assignments': return `Generated heats for ${workoutName}`
    case 'DELETE /workouts/:id/assignments': return `Cleared the heats of ${workoutName}`
    case 'PATCH /workouts/:id/assignments': return `Picked the member running a lane in ${workoutName}`
    case 'PUT /workouts/:id/assignments/reorder': return `Moved athletes between lanes in ${workoutName}`
    case 'PUT /workouts/:id/heat-times': return `Changed heat start times in ${workoutName}`
    case 'POST /workouts/:id/reset': return `Reset ${workoutName}`
    case 'POST /workouts/:id/knockout': return `Updated the knockout in ${workoutName}`
    case 'DELETE /workouts/:id/knockout': return `Cleared the knockout in ${workoutName}`
    case 'POST /workouts/:id/judge-assignments': return `Assigned a judge in ${workoutName}`
    case 'POST /workouts/:id/judge-assignments/generate': return `Generated judges for ${workoutName}`
    case 'DELETE /workouts/:id/judge-assignments': return `Removed judges in ${workoutName}`
    case 'POST /workouts/:id/equipment': return `Added equipment to ${workoutName}`
    case 'DELETE /workouts/:id/equipment/:equipmentId': return `Removed equipment from ${workoutName}`
    case 'PUT /workouts/:id': {
      const status = typeof body.status === 'string' ? body.status : null
      if (status && Object.keys(body).filter((k) => k !== 'slug').length === 1) {
        const verb = { active: 'Activated', completed: 'Completed', draft: 'Deactivated' }[status] ?? `Set to ${status}:`
        return `${verb} ${workoutName}`
      }
      return `Edited ${workoutName}`
    }
    case 'POST /workouts': return `Added workout ${typeof body.name === 'string' ? body.name : ''}`.trim()
    case 'DELETE /workouts/:id': return `Deleted ${workoutName}`
    case 'POST /athletes/:id/withdraw': return `Withdrew ${athleteParam}`
    case 'DELETE /athletes/:id/withdraw': return `Reinstated ${athleteParam}`
    case 'POST /athletes/:id/swap': return `Swapped ${athleteParam}'s heat with another athlete`
    case 'POST /athletes': return `Added ${typeof body.name === 'string' ? body.name : 'athletes'}`
    case 'PUT /athletes/:id': return `Edited ${athleteParam}`
    case 'DELETE /athletes/:id': return `Deleted ${athleteParam}`
    case 'DELETE /athletes': return 'Deleted every athlete'
    case 'PATCH /settings': {
      const keys = Object.keys(body).filter((k) => k !== 'slug')
      return keys.length ? `Changed settings: ${keys.join(', ')}` : 'Changed settings'
    }
    case 'POST /logo': return 'Uploaded the logo'
    case 'DELETE /logo': return 'Removed the logo'
    case 'POST /import/heats': return 'Imported heats'
    case 'POST /import/judge-assignments': return 'Imported judge assignments'
    case 'POST /import/competition-corner/apply': return 'Imported from Competition Corner'
    case 'POST /comp-users': return `Gave ${typeof body.email === 'string' ? body.email : 'someone'} access`
    case 'PATCH /comp-users/:userId': return `Changed a user's role to ${String(body.role ?? '')}`.trim()
    case 'DELETE /comp-users/:userId': return 'Removed a user\'s access'
    default: return entry.action
  }
}
