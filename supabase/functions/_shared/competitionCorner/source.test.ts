import { describe, expect, it } from 'vitest'
import { changesVersion, ImportRequest, loadPlan } from './source'
import { fixtureFetch } from './__fixtures__/fixtureFetch'
import type { Change } from './diff'

const body = { slug: 'default', url: 'https://competitioncorner.net/events/19948/details', tz: 'America/Los_Angeles', mergePartB: true }

describe('ImportRequest', () => {
  it('accepts a known time zone and refuses an unknown one', () => {
    expect(ImportRequest.safeParse(body).success).toBe(true)
    expect(ImportRequest.safeParse({ ...body, tz: 'Mars/Olympus' }).success).toBe(false)
  })
})

describe('loadPlan', () => {
  it('maps the event behind the link', async () => {
    const result = await loadPlan(body, fixtureFetch())
    if (!result.ok) throw new Error(await result.response.text())

    expect(result.event).toEqual({ id: 19948, name: expect.any(String) })
    expect(result.plan.workouts).toHaveLength(4)
  })

  it('answers 400 for a link that is not an event', async () => {
    const result = await loadPlan({ ...body, url: 'https://example.com' }, fixtureFetch())

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(400)
  })

  it('answers 502 when Competition Corner fails', async () => {
    const result = await loadPlan({ ...body, url: '1' }, fixtureFetch())

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(502)
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
