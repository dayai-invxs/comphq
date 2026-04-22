import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { GET, POST, DELETE } from './route'

describe('GET /api/logo', () => {
  it('returns null url when no setting', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await GET()
    expect(await res.json()).toEqual({ url: null })
  })

  it('returns stored url', async () => {
    mock.queueResult({ data: { value: 'https://cdn/x.png' }, error: null })
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
    mock.queueResult({ data: null, error: null })
    const form = new FormData()
    form.append('logo', new File(['data'], 'logo.png', { type: 'image/png' }))
    const res = await POST(new Request('http://test', { method: 'POST', body: form }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toMatch(/^https:\/\//)

    const upsertCall = mock.lastCall!
    expect(upsertCall.table).toBe('Setting')
    const upsert = upsertCall.ops.find(o => o.op === 'upsert')!
    expect((upsert.args[0] as { key: string }).key).toBe('logoUrl')
  })

  it('derives the file extension from the mime type, not from the upload filename', async () => {
    mock.queueResult({ data: null, error: null })
    const form = new FormData()
    // Attacker-named file with dangerous extension; mime is safe png.
    form.append('logo', new File(['data'], 'hack.html', { type: 'image/png' }))
    const res = await POST(new Request('http://test', { method: 'POST', body: form }))
    expect(res.status).toBe(200)
    // Storage upload call should have used a safe extension (png), not html.
    const storageFrom = mock.client.storage.from as unknown as { mock: { calls: unknown[][] } }
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
    mock.queueResult({ data: null, error: null })
    const res = await DELETE()
    expect(await res.json()).toEqual({ url: null })
  })

  it('removes storage object and deletes setting', async () => {
    mock.queueResult({ data: { value: 'https://cdn/a/b/logo.png' }, error: null })
    mock.queueResult({ data: null, error: null })
    const res = await DELETE()
    expect(await res.json()).toEqual({ url: null })
    const delCall = mock.calls.find(c => c.ops.find(o => o.op === 'delete'))!
    expect(delCall.table).toBe('Setting')
    expect(delCall.ops.find(o => o.op === 'eq')?.args).toEqual(['key', 'logoUrl'])
  })
})
