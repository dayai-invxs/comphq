import type { ZodType } from 'zod'

type ParseOk<T> = { ok: true; data: T }
type ParseErr = { ok: false; response: Response }

/**
 * Read JSON body and validate against a zod schema in one call.
 *
 * Returns a discriminated union so routes use the typed data without casts:
 *
 *   const parsed = await parseJson(req, SomeSchema)
 *   if (!parsed.ok) return parsed.response
 *   const { slug, name } = parsed.data
 *
 * 400 on malformed JSON or schema violation, 200-path otherwise.
 */
export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<ParseOk<T> | ParseErr> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return { ok: false, response: new Response('Invalid JSON body', { status: 400 }) }
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')
    return { ok: false, response: new Response(`Validation failed: ${msg}`, { status: 400 }) }
  }
  return { ok: true, data: result.data }
}
