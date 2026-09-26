export class HttpError extends Error {
  readonly name = 'HttpError'
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

async function parseJsonOrText(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) return await res.json()
  return await res.text()
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new HttpError(res.status, body || `HTTP ${res.status}`)
  }
  return (await parseJsonOrText(res)) as T
}

export async function getJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init })
  return handle<T>(res)
}

export async function postJson<T = unknown>(url: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  })
  return handle<T>(res)
}

export async function putJson<T = unknown>(url: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  })
  return handle<T>(res)
}

export async function patchJson<T = unknown>(url: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  })
  return handle<T>(res)
}

export async function delJson<T = unknown>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: body !== undefined ? { 'content-type': 'application/json', ...(init?.headers ?? {}) } : init?.headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  })
  return handle<T>(res)
}
