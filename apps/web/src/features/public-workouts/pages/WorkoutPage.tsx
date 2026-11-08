import { EmptyState, Link, Skeleton, Text } from '@mond-design-system/react'
import { useParams } from 'react-router'
import { usePublicWorkouts } from '@/api/publicWorkouts'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { RouterAnchor } from '@/components/RouterAnchor'
import styles from './WorkoutPage.module.css'

// One workout, with its whole description: here the description is the page,
// so it is never cut to a few lines as on the admin's workout screen.
export function WorkoutPage() {
  const { slug = '', workoutId = '' } = useParams()
  const workouts = usePublicWorkouts(slug)
  const workout = workouts.data?.find((w) => String(w.id) === workoutId)

  const back = <Link as={RouterAnchor} href={`/${slug}/workouts`}>All workouts</Link>

  if (workouts.error) {
    return (
      <PageFrame title="Workout">
        <EmptyState title="Could not load the workout" description={workouts.error.message} action={back} />
      </PageFrame>
    )
  }
  if (workouts.isPending) {
    return (
      <PageFrame title="Workout">
        <div aria-busy="true"><Skeleton lines={6} /></div>
      </PageFrame>
    )
  }
  if (!workout) {
    return (
      <PageFrame title="Workout">
        <EmptyState title="No such workout" description="It may not be announced yet." action={back} />
      </PageFrame>
    )
  }

  return (
    <PageFrame eyebrow={`Workout ${workout.number}`} title={workout.name} actions={back}>
      {workout.description?.trim()
        ? <Text className={styles.description}>{workout.description}</Text>
        : <Text tone="muted">No description yet.</Text>}
    </PageFrame>
  )
}
