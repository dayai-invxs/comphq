// One source for the server and the web app: how a place becomes points lives
// in supabase/functions/_shared/pointsScale.ts, and this re-exports it.
import { RANK_SCORING, type Scoring } from '../../../../supabase/functions/_shared/pointsScale'

export * from '../../../../supabase/functions/_shared/pointsScale'

/** The scoring rule from GET /api/settings; rank while it is loading or for
    functions older than the setting. */
export function scoringOf(settings: {
  scoringSystem?: 'rank' | 'points'
  pointsFirst?: number
  pointsStep?: number
} | undefined): Scoring {
  if (!settings || settings.scoringSystem !== 'points') return RANK_SCORING
  const d = RANK_SCORING.scale
  return {
    system: 'points',
    scale: {
      first: settings.pointsFirst ?? d.first,
      step: settings.pointsStep ?? d.step,
    },
  }
}
