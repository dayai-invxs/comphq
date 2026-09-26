import type { NavGroup } from '@/layouts/nav'

// The site-level screens, named once because two shells draw them. The site
// shell draws them as its whole rail; the competition shell draws them for a
// super admin, who administers every competition and so needs a way out of the
// one they are standing in. Before this the way out was the logo, which is a
// link people are expected to guess rather than one they are shown.
export const SITE_GROUP: NavGroup = {
  label: 'Site',
  items: [
    { to: '/admin', label: 'Competitions', icon: 'dashboard' },
    { to: '/admin/users', label: 'Manage Users', icon: 'users' },
  ],
}
