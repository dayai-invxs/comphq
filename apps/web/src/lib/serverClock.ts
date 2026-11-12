import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiGet } from '@/lib/api'

// How far this device's clock is from the server's, in ms (add it to
// Date.now() to get the server's time). A screen that acts on the time — the
// corral call — uses it so a TV or phone set a few minutes off still calls the
// heat on time. Measured from the middle of the request, so the trip there and
// back mostly cancels out; checked again every few minutes, which also catches
// a device whose clock is changed while the page is open.
//
// Until the first answer, or when the server cannot be reached, the device's
// own clock is all there is: the offset is 0.

const RECHECK_MS = 5 * 60_000

export async function measureServerOffset(): Promise<number> {
  const sent = Date.now()
  const { now } = await apiGet<{ now: number }>('/api/schedule/clock')
  const received = Date.now()
  if (typeof now !== 'number' || !Number.isFinite(now)) throw new Error('The server sent no time')
  return now - (sent + received) / 2
}

export function useServerClockOffset(): number {
  const { data } = useQuery({
    queryKey: queryKeys.serverClock,
    queryFn: measureServerOffset,
    staleTime: RECHECK_MS,
    refetchInterval: RECHECK_MS,
  })
  return data ?? 0
}
