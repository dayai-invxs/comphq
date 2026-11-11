import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { setting } from '@/db/schema'
import { DEFAULT_JUDGE_PASSWORD } from '@/lib/competitionDefaults'
import { getEnv } from '@/lib/env'

// What the judge and equipment screens carry once their password has been
// accepted, so the writes behind them (ticking checks) can be told apart from
// anyone else's. POST /api/settings/judge hands it out; the screens send it
// back in the `x-judge-token` header.
//
// It is a signature over the competition and its current password, keyed by
// the server's own secret: nothing is stored, a token for one competition
// opens no other, and changing the password retires every token handed out
// under the old one.

export const JUDGE_TOKEN_HEADER = 'x-judge-token'

/** The competition's judge password, or the default for one never set. */
export async function judgePassword(competitionId: number): Promise<string> {
  const rows = await db
    .select({ value: setting.value })
    .from(setting)
    .where(and(eq(setting.competitionId, competitionId), eq(setting.key, 'judgePassword')))
    .limit(1)
  return rows[0]?.value ?? DEFAULT_JUDGE_PASSWORD
}

function base64url(bytes: ArrayBuffer): string {
  let s = ''
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The token for this competition under this password. */
export async function judgeToken(competitionId: number, password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getEnv().SUPABASE_SERVICE_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`judge:${competitionId}:${password}`))
  return base64url(signature)
}

/** Whether the request carries a token for this competition's current password. */
export async function hasJudgeToken(req: Request, competitionId: number): Promise<boolean> {
  const sent = req.headers.get(JUDGE_TOKEN_HEADER)
  if (!sent) return false
  const expected = await judgeToken(competitionId, await judgePassword(competitionId))
  // Same length is all a token can be; compare every character regardless.
  if (sent.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < sent.length; i++) diff |= sent.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
