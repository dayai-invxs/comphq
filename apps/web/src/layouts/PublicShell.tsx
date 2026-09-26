import { useState } from 'react'
import {
  AppBar,
  Screen,
  ScreenContent,
  SideNav,
  SideNavGroup,
  SideNavItem,
  Sheet,
  SheetBody,
  TabBar,
  TabBarItem,
} from '@mond-design-system/react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import type { ReactNode } from 'react'
import { Glyph } from '@/components/Glyph/Glyph'
import { RouterAnchor } from '@/components/RouterAnchor'
import type { Destination } from './nav'
import { RouteBoundary } from './RouteBoundary'
import { MAIN_ID, SkipLink } from './SkipLink'
import styles from './PublicShell.module.css'

// The spectator and athlete frame. v1 put seven links in one row — Competition
// Schedule, Leaderboard, Athlete Overview, Judges, Equipment, Control, Admin —
// which mixes a spectator's three screens with the crew's three and the site
// admin's one. On a phone that collapsed into a hamburger where everything was
// equally buried.
//
// Split by audience instead: three thumb-reachable destinations plus More, and
// the staff screens live behind More where they belong. Above --mds-bp-lg the
// same rows become a rail; it is the same page, not a second one.

export function publicDestinations(slug: string): Destination[] {
  return [
    { to: `/${slug}`, label: 'Schedule', icon: 'schedule' },
    { to: `/${slug}/leaderboard`, label: 'Leaderboard', icon: 'leaderboard' },
    { to: `/${slug}/athlete-overview`, label: 'Athletes', icon: 'athletes' },
  ]
}

export function staffDestinations(slug: string): Destination[] {
  return [
    { to: `/${slug}/judges`, label: 'Judges', icon: 'judges' },
    { to: `/${slug}/equipment`, label: 'Equipment', icon: 'equipment' },
    { to: `/${slug}/control`, label: 'Control', icon: 'control' },
    { to: `/${slug}/admin`, label: 'Admin', icon: 'setup' },
  ]
}

export interface PublicShellProps {
  slug: string
  /** The competition's own mark, or the CompHQ one when it has none. */
  brand: ReactNode
  /** Freshness of the live read, at the far end of the bar. */
  status?: ReactNode
}

export function PublicShell({ slug, brand, status }: PublicShellProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  const main = publicDestinations(slug)
  const staff = staffDestinations(slug)

  function go(to: string) {
    setMoreOpen(false)
    navigate(to)
  }

  return (
    <Screen>
      <SkipLink />
      <AppBar title={brand} trailing={status} />

      <div className={styles.body}>
        <div className={styles.rail}>
          <SideNav label="Competition">
            <SideNavGroup>
              {main.map((d) => (
                <SideNavItem
                  key={d.to}
                  as={RouterAnchor}
                  href={d.to}
                  icon={<Glyph name={d.icon} />}
                  label={d.label}
                  active={pathname === d.to}
                />
              ))}
            </SideNavGroup>
            <SideNavGroup label="Staff">
              {staff.map((d) => (
                <SideNavItem
                  key={d.to}
                  as={RouterAnchor}
                  href={d.to}
                  icon={<Glyph name={d.icon} />}
                  label={d.label}
                  active={pathname === d.to}
                />
              ))}
            </SideNavGroup>
          </SideNav>
        </div>

        <ScreenContent id={MAIN_ID}>
          <RouteBoundary key={pathname}>
            <Outlet />
          </RouteBoundary>
        </ScreenContent>
      </div>

      <div className={styles.tabs}>
        <TabBar label="Competition">
          {main.map((d) => (
            <TabBarItem
              key={d.to}
              as={RouterAnchor}
              href={d.to}
              icon={<Glyph name={d.icon} />}
              label={d.label}
              active={pathname === d.to}
            />
          ))}
          <TabBarItem
            icon={<Glyph name="more" />}
            label="More"
            active={staff.some((d) => d.to === pathname)}
            onClick={() => setMoreOpen(true)}
          />
        </TabBar>
      </div>

      {/* The staff screens: reachable from anywhere, in nobody's way. */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} label="More">
        <SheetBody>
          <SideNav label="Staff screens">
            <SideNavGroup>
              {staff.map((d) => (
                <SideNavItem
                  key={d.to}
                  icon={<Glyph name={d.icon} />}
                  label={d.label}
                  active={pathname === d.to}
                  onClick={() => go(d.to)}
                />
              ))}
            </SideNavGroup>
          </SideNav>
        </SheetBody>
      </Sheet>
    </Screen>
  )
}
