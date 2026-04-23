import { db } from './db'
import { auditLog } from '@/db/schema'
import type { AuthedUser } from './auth-competition'

export type AuditEntry = {
  action: string
  resource: {
    type: string
    id: number | string | null
    competitionId: number | null
  }
  diff?: unknown
}

/**
 * Fire-and-forget audit trail. Errors are swallowed so the main operation
 * is never blocked by a logging failure; they're logged to stderr for ops.
 *
 * No-op when user is null (unauthenticated attempts are logged via
 * middleware in a later phase, not here).
 */
export async function logAudit(user: AuthedUser | null, entry: AuditEntry): Promise<void> {
  if (!user) return

  try {
    await db.insert(auditLog).values({
      userId: user.id,
      userName: user.email,
      competitionId: entry.resource.competitionId,
      action: entry.action,
      resourceType: entry.resource.type,
      resourceId: entry.resource.id == null ? null : String(entry.resource.id),
      diff: entry.diff ?? null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    console.error('[audit] failed to log:', entry.action, msg)
  }
}
