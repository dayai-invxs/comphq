import { describe, it, expect, vi, afterEach } from 'vitest'
import { postJson, getJson, HttpError } from './http'

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
})

function mockFetch(res: { status: number; body?: unknown; text?: string }) {
  global.fetch = vi.fn(async () => ({
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    headers: new Headers({ 'content-type': res.body !== undefined ? 'application/json' : 'text/plain' }),
    json: async () => res.body,
    text: async () => res.text ?? (res.body !== undefined ? JSON.stringify(res.body) : ''),
  })) as unknown as typeof global.fetch
}

describe('postJson', () => {
  it('returns parsed JSON on 200', async () => {
    mockFetch({ status: 200, body: { ok: true, id: 7 } })
    await expect(postJson('/api/x', { a: 1 })).resolves.toEqual({ ok: true, id: 7 })
  })

  it('sends JSON body with content-type header', async () => {
    mockFetch({ status: 201, body: {} })
    await postJson('/api/x', { a: 1 })
    const call = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    const init = call[1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ a: 1 }))
  })

  it('throws HttpError on 401 with server message', async () => {
    mockFetch({ status: 401, text: 'Unauthorized' })
    await expect(postJson('/api/x', {})).rejects.toMatchObject({
      name: 'HttpError',
      status: 401,
      message: expect.stringContaining('Unauthorized'),
    })
  })

  it('throws HttpError on 500', async () => {
    mockFetch({ status: 500, text: 'boom' })
    await expect(postJson('/api/x', {})).rejects.toBeInstanceOf(HttpError)
  })

  it('propagates network errors with a useful message', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network down') }) as typeof global.fetch
    await expect(postJson('/api/x', {})).rejects.toThrow(/network down/)
  })
})

describe('getJson', () => {
  it('returns parsed JSON on 200', async () => {
    mockFetch({ status: 200, body: [{ id: 1 }] })
    await expect(getJson('/api/y')).resolves.toEqual([{ id: 1 }])
  })

  it('throws HttpError on 404', async () => {
    mockFetch({ status: 404, text: 'Not found' })
    await expect(getJson('/api/y')).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    })
  })
})
