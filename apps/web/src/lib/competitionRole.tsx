import { createContext, useContext, type ReactNode } from 'react'

// Whether the signed-in person is this competition's admin, or one of its
// users (scorekeepers), for the screens inside the competition's admin shell.
//
// An admin sets the competition up: settings, people, workouts, heats, judges.
// A user runs it: enters scores, completes heats, activates and completes
// workouts, runs a knockout. The server refuses a user's setup writes either
// way (supabase/functions/_routes/roles.test.ts); this is so a user is not
// shown buttons that would only be refused.
//
// The shell (CompetitionAdminApp) decides and provides it. A screen drawn
// outside the shell, as in its own tests, is an admin's.

const CompetitionAdminContext = createContext(true)

export function CompetitionRoleProvider({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  return <CompetitionAdminContext.Provider value={isAdmin}>{children}</CompetitionAdminContext.Provider>
}

/** True for the competition's admins and super admins; false for its users. */
export function useIsCompetitionAdmin(): boolean {
  return useContext(CompetitionAdminContext)
}
