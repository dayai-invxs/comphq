/**
 * The server's clock, for screens that act on the time — the corral call goes
 * up at a heat's corral time, and a TV or phone whose own clock is off would
 * call it early or late. No competition and no auth: it is only the time.
 * Never cached, or the answer would be as old as the cache.
 */
export async function GET(): Promise<Response> {
  return Response.json({ now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } })
}
