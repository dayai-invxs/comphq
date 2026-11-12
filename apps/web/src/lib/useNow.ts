import { useEffect, useState } from 'react'

/** The wall clock, re-read every `intervalMs`. Whatever calls it re-renders
    on every tick, so keep it in the smallest component that needs the time. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
