'use client'

import { useEffect } from 'react'

/**
 * Runs `cb` every `ms` while the tab is visible; pauses when hidden. Fires once on visible again.
 */
export function usePollingInterval(cb: () => void, ms: number): void {
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null

    function start() {
      if (id != null) return
      id = setInterval(cb, ms)
    }
    function stop() {
      if (id == null) return
      clearInterval(id)
      id = null
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        cb()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [cb, ms])
}
