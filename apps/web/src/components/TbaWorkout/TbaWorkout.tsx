import { Text } from '@mond-design-system/react'
import { DataPanel } from '@/components/DataPanel/DataPanel'

// A secret workout that has not gone active yet. The server sends only its
// number, so the floor screens can say a workout is coming without saying
// what it is.
export function TbaWorkout({ number }: { number: number }) {
  return (
    <DataPanel title={`Workout ${number}: TBA`} tone="sunken">
      <Text variant="meta" tone="muted">Not announced yet.</Text>
    </DataPanel>
  )
}
