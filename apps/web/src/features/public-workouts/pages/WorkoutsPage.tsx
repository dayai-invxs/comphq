import { EmptyState, ListGroup, ListItem, Skeleton } from '@mond-design-system/react'
import { useParams } from 'react-router'
import { usePublicWorkouts } from '@/api/publicWorkouts'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { RouterAnchor } from '@/components/RouterAnchor'

// The spectator's list of workouts, as "Event N - Name". Each opens to its full
// description. Secret workouts are left out by the server until they go live.
export function WorkoutsPage() {
  const { slug = '' } = useParams()
  const workouts = usePublicWorkouts(slug)

  return (
    <PageFrame title="Workouts">
      {workouts.error ? (
        <EmptyState title="Could not load the workouts" description={workouts.error.message} />
      ) : workouts.isPending ? (
        <div aria-busy="true"><Skeleton lines={4} /></div>
      ) : workouts.data.length === 0 ? (
        <EmptyState title="No workouts yet" description="Workouts appear here once they are announced." />
      ) : (
        <ListGroup aria-label="Workouts">
          {workouts.data.map((w) => (
            <ListItem
              key={w.id}
              as={RouterAnchor}
              href={`/${slug}/workouts/${w.id}`}
              title={`Event ${w.number} - ${w.name}`}
            />
          ))}
        </ListGroup>
      )}
    </PageFrame>
  )
}
