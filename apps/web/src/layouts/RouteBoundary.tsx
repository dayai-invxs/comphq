import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, EmptyState } from '@mond-design-system/react'
import styles from './RouteBoundary.module.css'

// Inside the content area, never around the shell. A screen that throws should
// cost the reader the screen and not the navigation — with the boundary
// outside, one bad leaderboard takes the tab bar with it and the only way out
// is the browser's back button.
//
// It resets on the route key the shell hands it, so navigating away from a
// broken screen clears the error rather than showing it on the next one.

export class RouteBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Never swallowed: the shell keeps standing, the failure still reaches the
    // console the way an uncaught one would.
    console.error('Route failed to render', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className={styles.boundary}>
        <EmptyState
          title="This screen failed to load"
          description={error.message}
          action={
            <Button
              onClick={() => {
                this.setState({ error: null })
                this.props.onReset?.()
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    )
  }
}
