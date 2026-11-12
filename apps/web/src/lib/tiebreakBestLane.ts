// "Best athlete breaks ties": for a team split across heats (one lane per
// member), the team's tiebreak is its best lane's score instead of the sum
// of lane tiebreaks. The server works the tiebreak out from the lanes, so the
// tiebreak ranks the way the score does. A knockout has no split teams.

export const BEST_LANE_HINT = 'For a team split across heats, its best athlete’s score breaks ties. Nothing extra to enter.'

/** The tiebreak fields a workout form sends. */
export function tiebreakPatch(
  enabled: boolean,
  bestLane: boolean,
  tiebreakScoreType: string,
  format: { knockout: boolean; scoreType: string },
) {
  const best = enabled && bestLane && !format.knockout
  return { tiebreakBestLane: best, tiebreakScoreType: best ? format.scoreType : tiebreakScoreType }
}
