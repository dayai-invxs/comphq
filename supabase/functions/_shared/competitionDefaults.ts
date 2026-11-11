// What a competition gets for a setting it has never saved. Read by more than
// one route, so the routes cannot disagree about it.

/** The judge and equipment screens' password for a competition that has not
    set its own. Written into a new competition's settings when it is created;
    competitions from before it became the default had "rug702" written in. */
export const DEFAULT_JUDGE_PASSWORD = "I'majudge"

/** Live: results show as each heat is completed. The leaderboard has always
    behaved this way for an unsaved setting; Setup used to describe the other
    one, so a competition could appear to hide results it was showing. */
export const DEFAULT_LEADERBOARD_VISIBILITY = 'per_heat' as const

/** How long the TV board shows each of its two screens (the schedule and the
    leaderboard) before turning to the other. The board's own pace before it
    became a setting. */
export const DEFAULT_TV_SECONDS_PER_SCREEN = 10

/** Parsed from a stored setting, falling back to the default for a missing or
    unreadable one. */
export function tvSecondsPerScreen(raw: string | null | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 5 && n <= 120 ? n : DEFAULT_TV_SECONDS_PER_SCREEN
}
