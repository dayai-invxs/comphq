import type { Session } from 'next-auth'
import { supabase } from './supabase'

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
 * No-op when session is null (unauthenticated attempts are logged via
 * middleware in a later phase, not here).
 */
export async function logAudit(session: Session | null, entry: AuditEntry): Promise<void> {
  if (!session?.user) return

  const { error } = await supabase.from('AuditLog').insert({
    userId: typeof session.user === 'object' && 'id' in session.user ? Number(session.user.id) : null,
    userName: session.user.name ?? null,
    competitionId: entry.resource.competitionId,
    action: entry.action,
    resourceType: entry.resource.type,
    resourceId: entry.resource.id == null ? null : String(entry.resource.id),
    diff: entry.diff ?? null,
  })

  if (error) {
    console.error('[audit] failed to log:', entry.action, error.message)
  }
}
