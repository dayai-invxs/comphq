import { Link, Text } from '@mond-design-system/react'
import type { WorkoutScore } from '@/api/liveReads'

// One athlete's result in one workout, as both standings tables draw it: the
// placing, Part B beside it, the raw score, and the tiebreak under it. The
// admin board's only difference is that its placings can be edited, so that is
// a prop rather than a second cell.

type ScoreCellProps = {
  score: WorkoutScore
  /** Attaches the admin board's in-place points editor to the placing. */
  onEditPoints?: () => void
  /** Names that editor. A row holds one button per workout and they are all
      called `#2` on the face of it, so the workout has to be in the name or
      there is no telling them apart without sight of the column. */
  editLabel?: string
}

export function ScoreCell({ score, onEditPoints, editLabel }: ScoreCellProps) {
  if (!score) return <Text as="span" tone="muted">DNS</Text>

  const placing = `#${score.points}`
  return (
    <>
      <Text as="span" variant="label" tone={score.points === 1 ? 'warning' : score.points <= 3 ? 'accent' : 'primary'}>
        {onEditPoints
          ? (
            <Link
              as="button"
              type="button"
              variant="plain"
              onClick={onEditPoints}
              aria-label={editLabel && `${placing} — ${editLabel}`}
              title="Click to edit points"
            >
              {placing}
            </Link>
          )
          : placing}
      </Text>
      {score.partBPoints != null && (
        <Text as="span" variant="meta" tone="muted"> / B#{score.partBPoints}</Text>
      )}
      <Text as="span" variant="meta" tone="muted"> {score.display}</Text>
      {score.tiebreakDisplay && <Text variant="meta" tone="accent">TB {score.tiebreakDisplay}</Text>}
    </>
  )
}
