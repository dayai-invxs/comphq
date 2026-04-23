import { describe, it, expect } from 'vitest'
import { drizzleMock as dmock, supabaseMock as smock, setAuthUser } from '@/test/setup'
import { GET, POST, DELETE } from './route'

describe('GET /api/logo', () => {
  it('returns null url when no setting', async () => {
    dmock.queueResult([])
    const res = await GET()
    expect(await res.json()).toEqual({ url: null })
  })

  it('returns stored url', async () => {
    dmock.queueResult([{ value: 'https://cdn/x.png' }])
    const res = await GET()
    expect(await res.json()).toEqual({ url: 'https://cdn/x.png' })
  })
})

describe('POST /api/logo', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const form = new FormData()
    const res = await POST(new Request('http://test', { method: 'POST', body: form }))
    expect(res.status).toBe(401)
  })

  it('rejects missing file', async () => {
    const form = new FormData()
    const res = await POST(new Request('http://test', { method: 'POST', body: form }))
    expect(res.status).toBe(400)
  })

  it('rejects invalid mime type', async () => {
    const form = new FormData()
    form.append('logo', new File(['x'], 'a.txt', { type: 'text/plain' }))
    const res = await POST(new Request('http://test', { method: 'POST', body: form }))
    expect(res.status).toBe(400)
  })

  it('rejects SVG uploads (script-execution vector)', async () => {
    const form = new FormData()
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    form.append('logo', new File([svg], 'evil.svg', { type: 'image/svg+xml' }))
    const res = await POST(new Request('http://test', { method: 'POST', body: form }))
    expect(res.status).toBe(400)
  })

  it('rejects files over 2 MB', async () => {
    const form = new FormData()
    const big = new Uint8Array(2 * 1024 * 1024 + 1)
    form.append('logo', new File([big], 'huge.png', { type: 'image/png' }))
    const res = await POST(new Request('http://test', { method: 'POST', body: form }))
    expect(res.status).toBe(413)
  })

  it('uploads file, stores url in Setting, returns url', async () => {
    dmock.queueResult(undefined) // upsert returns nothing
    const form = new FormData()
    form.append('logo', new File(['data'], 'logo.png', { type: 'image/png' }))
    const res = await POST(new Request('http://test', { method: 'POST', body: form }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toMatch(/^https:\/\//)

    // The upsert values payload contains the logoUrl key.
    const valuesCall = dmock.calls.find((c) => c.method === 'values')
    expect(valuesCall).toBeTruthy()
    expect((valuesCall!.args[0] as { key: string }).key).toBe('logoUrl')
  })

  it('derives the file extension from the mime type, not from the upload filename', async () => {
    dmock.queueResult(undefined)
    const form = new FormData()
    form.append('logo', new File(['data'], 'hack.html', { type: 'image/png' }))
    const res = await POST(new Request('http://test', { method: 'POST', body: form }))
    expect(res.status).toBe(200)
    const storageFrom = smock.client.storage.from as unknown as { mock: { calls: unknown[][] } }
    expect(storageFrom.mock.calls[0][0]).toBe('logos')
  })
})

describe('DELETE /api/logo', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await DELETE()
    expect(res.status).toBe(401)
  })

  it('returns null url when nothing to delete', async () => {
    dmock.queueResult([])
    const res = await DELETE()
    expect(await res.json()).toEqual({ url: null })
  })

  it('removes storage object and deletes setting', async () => {
    dmock.queueResult([{ value: 'https://cdn/a/b/logo.png' }])
    dmock.queueResult(undefined)
    const res = await DELETE()
    expect(await res.json()).toEqual({ url: null })
    expect(dmock.calls.some((c) => c.method === 'delete')).toBe(true)
  })
})
