// One place that names a cached resource, so an invalidation after a mutation
// and the query it is meant to clear cannot drift apart.
export const queryKeys = {
  me: ['me'] as const,
  competitions: ['competitions'] as const,
  myCompetitions: ['competitions', 'mine'] as const,
  logo: ['logo'] as const,
  // Competition settings. The judge gate reads the password out of it and the
  // judge schedule reads the consecutive-heat limit, so the two screens share
  // one entry rather than asking twice.
  settings: (slug: string) => ['settings', slug] as const,
  // The live reads, all keyed by competition slug. Realtime invalidation names
  // the same keys the polling queries do, so a socket event and a poll refresh
  // the same cache entry.
  leaderboard: (slug: string) => ['leaderboard', slug] as const,
  ops: (slug: string) => ['ops', slug] as const,
  schedule: (slug: string) => ['schedule', slug] as const,
  checks: (slug: string) => ['checks', slug] as const,
  judgeSchedule: (slug: string) => ['judge-schedule', slug] as const,
  judgeAssignments: (slug: string, workoutId: string) =>
    ['judge-assignments', slug, workoutId] as const,
  workoutEquipment: (slug: string, workoutId: number) =>
    ['workout-equipment', slug, workoutId] as const,
  // The two rosters the admin screens read and write. Every mutation that
  // touches one names the key here rather than spelling the array again.
  athletes: (slug: string) => ['athletes', slug] as const,
  volunteers: (slug: string) => ['volunteers', slug] as const,
  // Written on the setup screen, read by the roster, the equipment scope and
  // the heat running order.
  divisions: (slug: string) => ['divisions', slug] as const,
  volunteerRoles: (slug: string) => ['volunteer-roles', slug] as const,
  // Who may work on one competition, and who may work on the site at all.
  compUsers: (slug: string) => ['comp-users', slug] as const,
  users: ['users'] as const,
  workouts: (slug: string) => ['workouts', slug] as const,
  // One workout with its assignments and scores, the read behind the detail
  // screen. Every write on that screen invalidates this key.
  workout: (slug: string, workoutId: string) => ['workout', slug, workoutId] as const,
  // Read on the workouts screen: where a workout can happen, and everything
  // every workout needs at once.
  workoutLocations: (slug: string) => ['workout-locations', slug] as const,
  equipmentSummary: (slug: string) => ['equipment-summary', slug] as const,
}
