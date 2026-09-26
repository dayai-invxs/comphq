import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { parseJson } from './parseJson'

const Schema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
})

function jsonReq(body: unknown) {
  return new Request('http://test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('parseJson', () => {
  it('returns ok:true with typed data on a valid body', async () => {
    const result = await parseJson(jsonReq({ name: 'Alice', age: 30 }), Schema)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual({ name: 'Alice', age: 30 })
  })

  it('returns 400 on missing field', async () => {
    const result = await parseJson(jsonReq({ name: 'Alice' }), Schema)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(400)
      expect(await result.response.text()).toMatch(/age/)
    }
  })

  it('returns 400 on wrong type', async () => {
    const result = await parseJson(jsonReq({ name: 'Alice', age: 'thirty' }), Schema)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(400)
  })

  it('returns 400 on malformed JSON', async () => {
    const req = new Request('http://test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    const result = await parseJson(req, Schema)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(400)
      expect(await result.response.text()).toMatch(/Invalid JSON/)
    }
  })

  it('lists all issues when multiple fields fail', async () => {
    const result = await parseJson(jsonReq({ name: '', age: -1 }), Schema)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const msg = await result.response.text()
      expect(msg).toMatch(/name/)
      expect(msg).toMatch(/age/)
    }
  })
})
