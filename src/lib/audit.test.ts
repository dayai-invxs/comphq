import { describe, it, expect } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { logAudit } from './audit'

const adminSession = { user: { name: 'admin' } } as unknown as Parameters<typeof logAudit>[0]

describe('logAudit', () => {
  it('inserts into AuditLog with action + resource + diff', async () => {
    mock.queueResult({ data: null, error: null })

    await logAudit(adminSession, {
      action: 'athlete.delete',
      resource: { type: 'Athlete', id: 42, competitionId: 1 },
      diff: { before: { name: 'Alice' } },
    })

    const call = mock.lastCall!
    expect(call.table).toBe('AuditLog')
    const insert = call.ops.find((o) => o.op === 'insert')!
    expect(insert.args[0]).toMatchObject({
      action: 'athlete.delete',
      resourceType: 'Athlete',
      resourceId: '42',
      competitionId: 1,
      diff: { before: { name: 'Alice' } },
    })
  })

  it('does not throw when session is null (no-op)', async () => {
    await expect(logAudit(null, {
      action: 'login.fail',
      resource: { type: 'User', id: null, competitionId: null },
    })).resolves.toBeUndefined()

    expect(mock.calls.length).toBe(0)
  })

  it('swallows insert errors (audit must not break the main op)', async () => {
    mock.queueResult({ data: null, error: { message: 'DB is down' } })
    await expect(logAudit(adminSession, {
      action: 'workout.create',
      resource: { type: 'Workout', id: 1, competitionId: 1 },
    })).resolves.toBeUndefined()
  })

  it('accepts null resourceId for top-level actions', async () => {
    mock.queueResult({ data: null, error: null })
    await logAudit(adminSession, {
      action: 'competition.create',
      resource: { type: 'Competition', id: null, competitionId: null },
    })
    const insert = mock.lastCall!.ops.find((o) => o.op === 'insert')!
    expect((insert.args[0] as { resourceId: number | null }).resourceId).toBeNull()
  })
})
