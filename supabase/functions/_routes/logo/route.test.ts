import { describe, it, expect } from 'vitest'
import { drizzleMock as dmock, supabaseMock as smock, setAuthUser } from '@/test/setup'
import { GET, POST, DELETE } from './route'

const req = (method: string, body?: FormData, slug = 'summer') =>
  new Request(`http://test/api/logo${slug ? `?slug=${slug}` : ''}`, { method, body })

const upload = (file: File, slug?: string) => {
  const form = new FormData()
  form.append('logo', file)
  return POST(req('POST', form, slug))
}

type StorageFrom = {
  mock: {
    calls: unknown[][]
    results: { value: { upload: { mock: { calls: unknown[][] } }; remove: { mock: { calls: unknown[][] } } } }[]
  }
}
const storage = () => smock.client.storage.from as unknown as StorageFrom
const uploads = () => storage().mock.results.flatMap((r) => r.value.upload.mock.calls)
const removals = () => storage().mock.results.flatMap((r) => r.value.remove.mock.calls)

describe('GET /api/logo', () => {
  it('returns null url when the competition has none', async () => {
    dmock.queueResult([])
    const res = await GET(req('GET'))
    expect(await res.json()).toEqual({ url: null })
  })

  it('returns the competition\'s own url', async () => {
    dmock.queueResult([{ value: 'https://cdn/x.png' }])
    const res = await GET(req('GET'))
    expect(await res.json()).toEqual({ url: 'https://cdn/x.png' })
  })

  // There is no site-wide logo any more: without a competition there is none.
  it('returns null without a competition', async () => {
    const res = await GET(req('GET', undefined, ''))
    expect(await res.json()).toEqual({ url: null })
    expect(dmock.calls).toHaveLength(0)
  })
})

describe('POST /api/logo', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await POST(req('POST', new FormData()))
    expect(res.status).toBe(401)
  })

  it('needs a competition', async () => {
    const res = await upload(new File(['x'], 'a.png', { type: 'image/png' }), '')
    expect(res.status).toBe(404)
  })

  it('rejects missing file', async () => {
    const res = await POST(req('POST', new FormData()))
    expect(res.status).toBe(400)
  })

  it('rejects invalid mime type', async () => {
    const res = await upload(new File(['x'], 'a.txt', { type: 'text/plain' }))
    expect(res.status).toBe(400)
  })

  it('rejects SVG uploads (script-execution vector)', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    const res = await upload(new File([svg], 'evil.svg', { type: 'image/svg+xml' }))
    expect(res.status).toBe(400)
  })

  it('rejects files over 2 MB', async () => {
    const res = await upload(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' }))
    expect(res.status).toBe(413)
  })

  it('stores the logo under the competition, and its url in that competition\'s settings', async () => {
    dmock.queueResult([]) // no previous logo
    dmock.queueResult(undefined) // upsert
    const res = await upload(new File(['data'], 'logo.png', { type: 'image/png' }))
    expect(res.status).toBe(200)
    expect(uploads()[0][0]).toBe('1/logo.png')
    const values = dmock.calls.find((c) => c.method === 'values')!.args[0] as { competitionId: number; key: string; value: string }
    expect(values).toMatchObject({ competitionId: 1, key: 'logoUrl' })
    // A fresh address per upload, so nobody is served the old picture.
    expect(values.value).toMatch(/^https:\/\/.*\?v=\d+$/)
    expect((await res.json()).url).toBe(values.value)
  })

  // The functions run on Deno, which has no Buffer ("Buffer is not
  // defined"). vitest runs on Node, which has one and leans on it inside
  // Request and Response, so it cannot be taken away here; what is checked
  // is that the route hands storage plain bytes rather than a Buffer.
  it('uploads plain bytes, not Node\'s Buffer, which Deno lacks', async () => {
    dmock.queueResult([])
    dmock.queueResult(undefined)
    await upload(new File(['data'], 'logo.png', { type: 'image/png' }))
    const sent = uploads()[0][1]
    expect(sent).toBeInstanceOf(Uint8Array)
    expect(Buffer.isBuffer(sent)).toBe(false)
    expect(new TextDecoder().decode(sent as Uint8Array)).toBe('data')
  })

  it('derives the file extension from the mime type, not from the upload filename', async () => {
    dmock.queueResult([])
    dmock.queueResult(undefined)
    await upload(new File(['data'], 'hack.html', { type: 'image/jpeg' }))
    expect(storage().mock.calls[0][0]).toBe('logos')
    expect(uploads()[0][0]).toBe('1/logo.jpg')
  })

  it('removes the old file when the new one has another extension', async () => {
    dmock.queueResult([{ value: 'https://x.supabase.co/storage/v1/object/public/logos/1/logo.png?v=1' }])
    dmock.queueResult(undefined)
    await upload(new File(['data'], 'logo.jpg', { type: 'image/jpeg' }))
    expect(removals()).toEqual([[['1/logo.png']]])
  })

  it('leaves the file alone when the new one replaces it in place', async () => {
    dmock.queueResult([{ value: 'https://x.supabase.co/storage/v1/object/public/logos/1/logo.png?v=1' }])
    dmock.queueResult(undefined)
    await upload(new File(['data'], 'logo.png', { type: 'image/png' }))
    expect(removals()).toEqual([])
  })
})

describe('DELETE /api/logo', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await DELETE(req('DELETE'))
    expect(res.status).toBe(401)
  })

  it('returns null url when nothing to delete', async () => {
    dmock.queueResult([])
    const res = await DELETE(req('DELETE'))
    expect(await res.json()).toEqual({ url: null })
  })

  it('removes the stored file, ignoring the ?v= stamp, and the setting', async () => {
    dmock.queueResult([{ value: 'https://x.supabase.co/storage/v1/object/public/logos/1/logo.png?v=123' }])
    dmock.queueResult(undefined)
    const res = await DELETE(req('DELETE'))
    expect(await res.json()).toEqual({ url: null })
    expect(removals()).toEqual([[['1/logo.png']]])
    expect(dmock.calls.some((c) => c.method === 'delete')).toBe(true)
  })
})
