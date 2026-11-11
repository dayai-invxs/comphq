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
