import type { ReactNode } from 'react'
import { EmptyState } from '@mond-design-system/react'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { useIsCompetitionAdmin } from '@/lib/competitionRole'

// The setup screens, reached by a competition user (scorekeeper) through an
// old link or a typed address. The menu does not offer them, and the server
// refuses their writes; this says why rather than drawing a page of buttons
// that would each be refused.
export function AdminOnly({ title, children }: { title: string; children: ReactNode }) {
  if (useIsCompetitionAdmin()) return <>{children}</>
  return (
    <PageFrame title={title}>
      <EmptyState
        title="For competition admins"
        description="Your account runs this competition: scores, heats and workouts. Setting it up is for its admins."
      />
    </PageFrame>
  )
}
