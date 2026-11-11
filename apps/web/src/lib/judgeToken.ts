// The token a judge or equipment screen is handed when its password is
// accepted (POST /api/settings/judge), kept for the tab and sent back with the
// screen's writes in the `x-judge-token` header. Without it the server takes
// ticks only from the competition's signed-in people.
//
// Per competition: an unlock for one competition opens no other. A token the
// server stops accepting (the password was changed on Setup) is forgotten,
// and the gate asks for the password again.

export const JUDGE_TOKEN_HEADER = 'x-judge-token'
const FORGOTTEN = 'comphq:judge-token-forgotten'

const key = (slug: string) => `judgeToken:${slug}`

export function judgeToken(slug: string): string | null {
  try { return sessionStorage.getItem(key(slug)) } catch { return null }
}

export function rememberJudgeToken(slug: string, token: string): void {
  try { sessionStorage.setItem(key(slug), token) } catch { /* this visit only */ }
}

export function forgetJudgeToken(slug: string): void {
  try { sessionStorage.removeItem(key(slug)) } catch { /* nothing kept */ }
  window.dispatchEvent(new CustomEvent(FORGOTTEN, { detail: slug }))
}

/** Calls back when this competition's token is forgotten. */
export function onJudgeTokenForgotten(slug: string, callback: () => void): () => void {
  const listener = (e: Event) => { if ((e as CustomEvent<string>).detail === slug) callback() }
  window.addEventListener(FORGOTTEN, listener)
  return () => window.removeEventListener(FORGOTTEN, listener)
}

/** The header to send with a write from a judge screen, when it has a token. */
export function judgeHeaders(slug: string): Record<string, string> {
  const token = judgeToken(slug)
  return token ? { [JUDGE_TOKEN_HEADER]: token } : {}
}
