import { describe, expect, it } from 'vitest'
import { changesVersion, ImportRequest, loadPlan } from './source'
import { rawEvent19948 } from './__fixtures__/event19948'
import type { Change } from './diff'

const body = { slug: 'default', tz: 'America/Los_Angeles', mergePartB: true, event: rawEvent19948() }

describe('ImportRequest', () => {
  it('accepts a known time zone and refuses an unknown one', () => {
    expect(ImportRequest.safeParse(body).success).toBe(true)
    expect(ImportRequest.safeParse({ ...body, tz: 'Mars/Olympus' }).success).toBe(false)
  })
})

describe('loadPlan', () => {
  it('maps the posted event', () => {
    const result = loadPlan(body)
    if (!result.ok) throw new Error('expected a plan')

    expect(result.event).toEqual({ id: 19948, name: 'Rugged Rumble - Gladiator Games' })
    expect(result.plan.workouts).toHaveLength(4)
  })

  it('answers 400 saying where a posted event stops matching', async () => {
    const result = loadPlan({ ...body, event: { ...rawEvent19948(), heats: 'nope' } })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(400)
    expect(await result.response.text()).toMatch(/not in the shape the import reads \(at heats\)/)
  })
})

describe('changesVersion', () => {
  const change = (key: string): Change => ({ key, entity: 'division', kind: 'add', id: null, label: key, fields: [], warnings: [], requires: [] })

  it('is stable for the same changes and differs when they differ', async () => {
    const a = await changesVersion([change('division:1')])

    expect(await changesVersion([change('division:1')])).toBe(a)
    expect(await changesVersion([change('division:2')])).not.toBe(a)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})
