import {
  AppBar,
  Button,
  Menu,
  MenuItem,
  Screen,
  ScreenContent,
  SideNav,
  SideNavGroup,
  SideNavItem,
} from '@mond-design-system/react'
import { useLocation, useNavigate } from 'react-router'
import type { ReactNode } from 'react'
import { Glyph } from '@/components/Glyph/Glyph'
import { RouterAnchor } from '@/components/RouterAnchor'
import type { Destination, NavGroup } from './nav'
import { RouteBoundary } from './RouteBoundary'
import { MAIN_ID, SkipLink } from './SkipLink'
import styles from './AdminShell.module.css'
import { useScrollTopOnNavigate } from './useScrollTopOnNavigate'

// The admin chrome. v1 drew the same bar twice, once in /admin/layout.tsx and
// once in /[slug]/admin/layout.tsx, and they had already drifted: one closed
// its mobile menu on navigation and the other did not.
//
// The rail is grouped by what the person is doing rather than by which table
// the screen reads — Run, People, Setup. Eight flat rows named after tables is
// a list to search; three named runs is a place to look.

export interface AdminShellProps {
  title: ReactNode
  groups: NavGroup[]
  /** Destinations out of the admin tree — the public screens, the other shell. */
  extras?: Destination[]
  /** Groups drawn last, after the public screens and just above Sign out. */
  trailing?: NavGroup[]
  onSignOut: () => void
  children: ReactNode
}

export function AdminShell({ title, groups, extras = [], trailing = [], onSignOut, children }: AdminShellProps) {
  const { pathname } = useLocation()
  const contentRef = useScrollTopOnNavigate<HTMLElement>()
  const navigate = useNavigate()
  const flat = [...groups.flatMap((g) => g.items), ...extras, ...trailing.flatMap((g) => g.items)]

  const group = (g: NavGroup) => (
    <SideNavGroup key={g.label} label={g.label}>
      {g.items.map((d) => (
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
  )

  return (
    <div className={styles.shell}>
    <Screen>
      <SkipLink />
      <AppBar
        title={title}
        trailing={
          <span className={styles.menu}>
            <Menu label="Navigation" trigger={<Button variant="ghost" size="sm">Menu</Button>}>
              {flat.map((d) => (
                <MenuItem key={d.to} onSelect={() => navigate(d.to)}>{d.label}</MenuItem>
              ))}
              <MenuItem onSelect={onSignOut}>Sign out</MenuItem>
            </Menu>
          </span>
        }
      />
      <div className={styles.body}>
        <div className={styles.rail}>
          <SideNav label="Admin">
            {groups.map(group)}
            {extras.length > 0 && group({ label: 'Public', items: extras })}
            {trailing.map(group)}
            <SideNavGroup>
              <SideNavItem label="Sign out" onClick={onSignOut} />
            </SideNavGroup>
          </SideNav>
        </div>
        <ScreenContent id={MAIN_ID} className={styles.content} ref={contentRef}>
          <RouteBoundary key={pathname}>{children}</RouteBoundary>
        </ScreenContent>
      </div>
    </Screen>
    </div>
  )
}
