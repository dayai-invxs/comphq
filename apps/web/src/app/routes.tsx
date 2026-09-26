import type { ComponentType, ReactElement } from 'react'
import type { RouteObject } from 'react-router'
import { FirstCompetitionRedirect, SlugRedirect } from '@/features/competitions/pages/Redirects'
import { RouteError } from './RouteError'
import { StyleguidePage } from '@/features/styleguide/pages/StyleguidePage'
import { AdminApp } from './AdminApp'
import { CompetitionPublicApp } from './CompetitionPublicApp'
import { CompetitionAdminApp } from './CompetitionAdminApp'
import { PublicApp } from './PublicApp'
import { RequireCompetition } from './RequireCompetition'
import { RequireSession } from './RequireSession'

// v1's route table was its directory layout, which is the one part of the port
// with no file to copy. routes.parity.test.ts derives the same table from v1's
// page tree and demands this match it, so a page v1 serves and v3 does not is
// a failing test rather than a 404 someone finds in production.
//
// Paths are v1's verbatim, `TV` included: it is upper-case in v1's URL, and a
// QR code printed for a gym display outlives the port.
//
// Every path now resolves to a ported page. `Pending` is still in the tree and
// routes.test.tsx still looks for it, so a path added ahead of its page is
// caught rather than shipped blank.
//
// The table may now hold more than v1's 24 paths, but not silently: anything
// added has to be named in routes.parity.test.ts's ADDED map with its reason.

// Every page is split into its own chunk: with everything in one bundle the
// phone that scans a QR code at the door downloaded eight admin screens to
// read a heat list. `lazy` is react-router's own split, and it works here
// because the router is a data router — the module is fetched while the route
// is matched, before anything of the page renders, so there is no fallback to
// design and nothing flashes. Only the shells, gates and redirects stay
// eager: they are a few lines each and every route needs one.
//
// The key is passed separately because the pages export a named component
// rather than a default, and naming it keeps the module's own type. `wrap`
// lets a gated route keep its gates in this table, where the other gates
// live, while the page behind them still loads on demand.
function lazyPage<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  key: K,
  wrap: (page: ReactElement) => ReactElement = (page) => page,
) {
  return async () => {
    const Page: ComponentType = (await load())[key]
    return { Component: () => wrap(<Page />) }
  }
}

// One pathless route wraps the whole table so its errorElement is the app's
// floor: a render throw on any screen, a chunk a stale phone can no longer
// fetch, or a URL nothing serves all land on RouteError rather than a white
// page. Pathless, so it adds no segment and the parity test's view of the
// table is unchanged.
export const routes: RouteObject[] = [{
  errorElement: <RouteError />,
  children: routeTable(),
}]

function routeTable(): RouteObject[] {
  return [
  {
    path: '/',
    element: <PublicApp />,
    children: [
      { index: true, lazy: lazyPage(() => import('@/features/competitions/pages/WelcomePage'), 'WelcomePage') },
      { path: 'login', lazy: lazyPage(() => import('@/features/auth/pages/LoginPage'), 'LoginPage') },
      { path: 'forgot-password', lazy: lazyPage(() => import('@/features/auth/pages/ForgotPasswordPage'), 'ForgotPasswordPage') },
      { path: 'reset-password', lazy: lazyPage(() => import('@/features/auth/pages/ResetPasswordPage'), 'ResetPasswordPage') },
      // The two site-wide operator screens. v1 serves them both here and under
      // a slug, and the pages differ.
      { path: 'control', element: <FirstCompetitionRedirect page="control" /> },
      { path: 'ops', element: <FirstCompetitionRedirect page="athlete-overview" /> },
    ],
  },

  // Beside the public frame, not inside it: CompetitionPublicApp brings the
  // competition's own chrome, and a frame inside PublicApp's frame drew two
  // ScreenContents around every spectator page — a doubled page gutter and two
  // main landmarks.
  {
    path: '/:slug',
    children: [
      // The three spectator screens share the competition's chrome.
      {
        element: <CompetitionPublicApp />,
        children: [
          {
            index: true,
            lazy: lazyPage(
              () => import('@/features/schedule/pages/SchedulePage'),
              'SchedulePage',
              (page) => <RequireCompetition>{page}</RequireCompetition>,
            ),
          },
          {
            path: 'athlete-overview',
            lazy: lazyPage(
              () => import('@/features/ops/pages/AthleteOverviewPage'),
              'AthleteOverviewPage',
              (page) => <RequireCompetition>{page}</RequireCompetition>,
            ),
          },
          // No RequireCompetition here: v1's leaderboard is the one [slug]
          // page that never called resolveCompetition, so an unknown slug
          // renders the empty board rather than a 404. That asymmetry is
          // v1's own.
          {
            path: 'leaderboard',
            lazy: lazyPage(() => import('@/features/leaderboard/pages/LeaderboardPage'), 'LeaderboardPage'),
          },
        ],
      },

      // A redirect draws nothing, so it takes no chrome on the way past.
      { path: 'ops', element: <SlugRedirect page="athlete-overview" /> },
    ],
  },

  // Outside the public frame on purpose: the scoreboard owns the viewport and
  // does not scroll.
  { path: '/:slug/TV', lazy: lazyPage(() => import('@/features/tv/pages/TvPage'), 'TvPage') },

  // The station screens, for the same reason: each draws its own operator
  // frame — a context bar, the list, no navigation — and a frame inside the
  // public frame would be a second header and a second scroll container.
  //
  // Control is the one public-side page that asks for a sign-in, and it asks
  // in v1's order: session first, competition second.
  {
    path: '/:slug/control',
    lazy: lazyPage(
      () => import('@/features/control/pages/AthleteControlPage'),
      'AthleteControlPage',
      (page) => (
        <RequireSession>
          <RequireCompetition>{page}</RequireCompetition>
        </RequireSession>
      ),
    ),
  },
  {
    path: '/:slug/equipment',
    lazy: lazyPage(
      () => import('@/features/equipment/pages/EquipmentPage'),
      'EquipmentPage',
      (page) => <RequireCompetition>{page}</RequireCompetition>,
    ),
  },
  {
    path: '/:slug/judges',
    lazy: lazyPage(
      () => import('@/features/judges/pages/JudgeSchedulePage'),
      'JudgeSchedulePage',
      (page) => <RequireCompetition>{page}</RequireCompetition>,
    ),
  },

  {
    path: '/:slug/admin',
    element: <CompetitionAdminApp />,
    children: [
      {
        index: true,
        lazy: lazyPage(() => import('@/features/dashboard/pages/CompetitionDashboardPage'), 'CompetitionDashboardPage'),
      },
      {
        path: 'leaderboard',
        lazy: lazyPage(() => import('@/features/admin-leaderboard/pages/AdminLeaderboardPage'), 'AdminLeaderboardPage'),
      },
      {
        path: 'people',
        lazy: lazyPage(() => import('@/features/admin-people/pages/PeoplePage'), 'PeoplePage'),
      },
      {
        path: 'setup',
        lazy: lazyPage(() => import('@/features/admin-setup/pages/SetupPage'), 'SetupPage'),
      },
      {
        path: 'users',
        lazy: lazyPage(() => import('@/features/comp-users/pages/CompetitionUsersPage'), 'CompetitionUsersPage'),
      },
      {
        path: 'workouts',
        children: [
          {
            index: true,
            lazy: lazyPage(() => import('@/features/admin-workouts/pages/WorkoutsAdminPage'), 'WorkoutsAdminPage'),
          },
          {
            path: ':id',
            lazy: lazyPage(() => import('@/features/workout-detail/pages/WorkoutDetailPage'), 'WorkoutDetailPage'),
          },
        ],
      },
    ],
  },

  // The design language on one page. Dev-only, so the production build never
  // carries it and the parity table never has to explain it to a visitor.
  ...(import.meta.env.DEV ? [{ path: '/styleguide', element: <StyleguidePage /> }] : []),

  {
    path: '/admin',
    element: <AdminApp />,
    children: [
      {
        index: true,
        lazy: lazyPage(() => import('@/features/admin-home/pages/AdminHomePage'), 'AdminHomePage'),
      },
      {
        path: 'users',
        lazy: lazyPage(() => import('@/features/site-users/pages/SiteUsersPage'), 'SiteUsersPage'),
      },
    ],
  },
  ]
}
