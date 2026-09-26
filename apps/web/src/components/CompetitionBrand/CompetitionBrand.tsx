import { useLogo } from '@/api/logo'
import { ComphqLogo } from '@/components/ComphqLogo/ComphqLogo'
import { RouterAnchor } from '@/components/RouterAnchor'
import styles from './CompetitionBrand.module.css'

// What names the competition in the bar: the logo it uploaded, or the CompHQ
// lockup until it does. v1 asked /api/logo from an effect inside its nav, so
// each public page fetched it again; here it is the shared query and the shell
// asks once for all of them.
//
// The mark is also the way home, because that is what the mark in the corner
// means on every site people know. The label names the destination rather
// than the artwork, since the artwork changes and the destination does not.
// "Home" differs by shell — the public site's front page, the admin's index —
// so the destination is the one prop.

export function CompetitionBrand({ href = '/' }: { href?: string }) {
  const logo = useLogo()

  return (
    <RouterAnchor href={href} aria-label="CompHQ home" className={styles.home}>
      {logo.data?.url ? (
        <img src={logo.data.url} alt="Competition logo" className={styles.logo} />
      ) : (
        <span className={styles.lockup}>
          <ComphqLogo variant="lockup" />
        </span>
      )}
    </RouterAnchor>
  )
}
