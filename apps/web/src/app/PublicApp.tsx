import { Screen, ScreenContent } from '@mond-design-system/react'
import { Outlet } from 'react-router'

// The frame every public page hangs in. v1 had no public layout at all — each
// page drew its own header — so this deliberately adds no chrome; it is the
// scrolling page body that v1's root layout supplied with `min-h-full` on the
// body element, and nothing more.
//
// The TV scoreboard is not under it: that page owns the viewport and does not
// scroll, so it is a leaf route.
export function PublicApp() {
  return (
    <Screen>
      <ScreenContent>
        <Outlet />
      </ScreenContent>
    </Screen>
  )
}
