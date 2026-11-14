import { useParams } from 'react-router'
import { CompetitionBrand } from '@/components/CompetitionBrand/CompetitionBrand'
import { PublicShell } from '@/layouts/PublicShell'
import { useSession } from '@/lib/session'

// The frame the three spectator screens hang in. v1 had no public layout —
// each page drew SlugNav itself — because the judge and equipment screens sit
// behind a password and must show no chrome until it opens. Those screens are
// operator screens now and have their own frame, so the layout route the port
// could not have is the right shape here.
export function CompetitionPublicApp() {
  const { slug = '' } = useParams()
  // Still asking counts as signed out: the staff run opens once the answer
  // lands, rather than showing to a spectator and then folding away.
  const { user } = useSession()
  return <PublicShell slug={slug} brand={<CompetitionBrand slug={slug} />} signedIn={user != null} />
}
