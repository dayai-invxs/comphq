import { useEffect } from 'react'

// Keeps the screen on while the board is up. Nobody touches a TV on the gym
// wall, so to the device it looks idle, and a Fire Stick or smart TV puts its
// screensaver over the board after a few minutes.
//
// The Screen Wake Lock API is the browser's own way to say "a person is
// watching this": the same thing a video player does to keep the screensaver
// away. The browser drops the lock whenever the page is hidden (the TV's home
// screen, another app, a tab switch), so it is asked for again each time the
// page comes back. Some browsers only grant it after a press, so any key on
// the remote or click on the page asks again too.
//
// A browser without the API, or one that refuses (not https, power saving),
// just leaves the board as it was: the device's own screensaver setting is
// then the only fix.

type Sentinel = { released: boolean; release(): Promise<void>; addEventListener(type: 'release', fn: () => void): void }
type WakeLockApi = { request(type: 'screen'): Promise<Sentinel> }

export function useKeepAwake() {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock
    if (!wakeLock) return

    let lock: Sentinel | null = null
    let pending = false
    let stopped = false

    async function acquire() {
      if (stopped || pending || document.visibilityState !== 'visible') return
      if (lock && !lock.released) return
      pending = true
      try {
        const next = await wakeLock!.request('screen')
        if (stopped) {
          void next.release()
          return
        }
        lock = next
      } catch {
        // Refused; the next press or return to the page tries again.
      } finally {
        pending = false
      }
    }

    const onVisible = () => void acquire()
    const onPress = () => void acquire()

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('keydown', onPress)
    window.addEventListener('pointerdown', onPress)

    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('keydown', onPress)
      window.removeEventListener('pointerdown', onPress)
      if (lock && !lock.released) void lock.release()
    }
  }, [])
}
