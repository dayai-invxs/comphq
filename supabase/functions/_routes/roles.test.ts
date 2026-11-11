import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it, expect } from 'vitest'

// Who may change what. A competition has two roles:
//   admin — sets it up: settings, divisions, people, workouts, heats, judges.
//   user  — runs it: enters scores, completes heats, activates and completes
//           workouts, starts and runs a knockout. Nothing in setup, no
//           withdrawals, no clearing all scores, no workout reset, no users.
// Site-wide screens (competitions, accounts) are the super admin's.
//
// Every handler that changes something is listed here with the check it
// makes, so a route added later fails this test until someone decides which
// side it is on.

type Gate =
  | 'admin'       // requireCompetitionAdmin
  | 'user'        // requireCompetitionAccess: any member, user role included
  | 'site'        // requireSiteAdmin
  | 'status-only' // a user may change the status alone; anything else is admin
  | 'judge'       // a member, or a screen unlocked with the judge password
  | 'open'        // anyone: the judge password check itself

const POLICY: Record<string, Gate> = {
  // Running the competition.
  'POST workouts/[id]/scores': 'user',
  'PATCH workouts/[id]/scores': 'user',
  'POST workouts/[id]/calculate': 'user',
  'POST workouts/[id]/heats/[heatNum]/complete': 'user',
  'DELETE workouts/[id]/heats/[heatNum]/complete': 'user',
  'PATCH workouts/[id]/assignments': 'user', // who on a split team runs a lane
  'POST workouts/[id]/knockout': 'user', // start, advance and finish
  'DELETE workouts/[id]/knockout': 'user', // undo the latest round
  'PUT workouts/[id]': 'status-only',
  'PATCH checks': 'judge',
  'POST settings/judge': 'open',

  // Setting it up.
  'POST workouts': 'admin',
  'DELETE workouts/[id]': 'admin',
  'POST workouts/[id]/reset': 'admin',
  'DELETE workouts/[id]/scores': 'admin', // clear every score in the workout
  'POST workouts/[id]/assignments': 'admin',
  'DELETE workouts/[id]/assignments': 'admin',
  'PUT workouts/[id]/assignments/reorder': 'admin',
  'DELETE workouts/[id]/heats/[heatNum]': 'admin',
  'PUT workouts/[id]/heat-times': 'admin',
  'POST workouts/[id]/equipment': 'admin',
  'DELETE workouts/[id]/equipment/[equipmentId]': 'admin',
  'POST workouts/[id]/judge-assignments': 'admin',
  'DELETE workouts/[id]/judge-assignments': 'admin',
  'POST workouts/[id]/judge-assignments/generate': 'admin',
  'POST athletes': 'admin',
  'DELETE athletes': 'admin',
  'PUT athletes/[id]': 'admin',
  'DELETE athletes/[id]': 'admin',
  'POST athletes/[id]/swap': 'admin',
  'POST athletes/[id]/withdraw': 'admin',
  'DELETE athletes/[id]/withdraw': 'admin',
  'POST divisions': 'admin',
  'PUT divisions/[id]': 'admin',
  'DELETE divisions/[id]': 'admin',
  'POST volunteers': 'admin',
  'DELETE volunteers': 'admin',
  'PUT volunteers/[id]': 'admin',
  'DELETE volunteers/[id]': 'admin',
  'POST volunteers/[id]/swap': 'admin',
  'POST volunteer-roles': 'admin',
  'PUT volunteer-roles/[id]': 'admin',
  'DELETE volunteer-roles/[id]': 'admin',
  'POST workout-locations': 'admin',
  'PUT workout-locations/[id]': 'admin',
  'DELETE workout-locations/[id]': 'admin',
  'PATCH settings': 'admin',
  'POST logo': 'admin',
  'DELETE logo': 'admin',
  'POST import/heats': 'admin',
  'POST import/judge-assignments': 'admin',
  'POST import/competition-corner/preview': 'admin',
  'POST import/competition-corner/apply': 'admin',
  'POST comp-users': 'admin',
  'PATCH comp-users/[userId]': 'admin',
  'DELETE comp-users/[userId]': 'admin',

  // The site's own screens.
  'POST competitions': 'site',
  'PATCH competitions/[id]': 'site',
  'DELETE competitions/[id]': 'site',
  'POST users': 'site',
  'PATCH users/[id]': 'site',
  'DELETE users/[id]': 'site',
  'POST users/[id]/reset-password': 'site',
}

const ROOT = __dirname

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return routeFiles(path)
    return name === 'route.ts' ? [path] : []
  })
}

/** Every handler that changes something, and the source of its body. */
function mutatingHandlers(): Map<string, string> {
  const found = new Map<string, string>()
  for (const file of routeFiles(ROOT)) {
    const route = relative(ROOT, file).replace(/\/route\.ts$/, '')
    const src = readFileSync(file, 'utf8')
    for (const part of src.split(/(?=^export async function (?:GET|POST|PUT|PATCH|DELETE)\b)/m)) {
      const m = /^export async function (POST|PUT|PATCH|DELETE)\b/.exec(part)
      if (!m) continue
      // A handler that checks through a helper in the same file carries the
      // helper's check with it.
      const helpers = [...part.matchAll(/await (\w+)\(/g)].map((h) => h[1])
      const helperSrc = helpers
        .map((h) => new RegExp(`^(?:async )?function ${h}\\b[\\s\\S]*?^}`, 'm').exec(src)?.[0] ?? '')
        .join('\n')
      found.set(`${m[1]} ${route}`, part + '\n' + helperSrc)
    }
  }
  return found
}

const CHECK: Record<Gate, RegExp> = {
  admin: /requireCompetitionAdmin\(/,
  user: /requireCompetitionAccess\(/,
  site: /requireSiteAdmin\(/,
  'status-only': /requireCompetitionAdmin\([\s\S]*requireCompetitionAccess\(|requireCompetitionAccess\([\s\S]*requireCompetitionAdmin\(/,
  judge: /mayTick\(/,
  open: /^(?![\s\S]*require(?:CompetitionAccess|CompetitionAdmin|SiteAdmin)\()/,
}

describe('who may change what', () => {
  const handlers = mutatingHandlers()

  it('has decided every handler that changes something', () => {
    const undecided = [...handlers.keys()].filter((k) => !(k in POLICY))
    expect(undecided).toEqual([])
    const gone = Object.keys(POLICY).filter((k) => !handlers.has(k))
    expect(gone).toEqual([])
  })

  for (const [key, gate] of Object.entries(POLICY)) {
    it(`${key} is ${gate}`, () => {
      const src = handlers.get(key) ?? ''
      expect(src).toMatch(CHECK[gate])
      // A setup route never falls back to the weaker check.
      if (gate === 'admin') expect(src).not.toMatch(/requireCompetitionAccess\(/)
    })
  }
})
