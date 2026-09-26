import { z } from 'zod'

// Server-side config only. The SPA validates its own VITE_* vars in
// apps/web/src/lib/env.ts — a runtime should not validate config it never
// reads. The anon key appears here because the user-scoped client in
// supabase-server.ts is created on the server.
const baseSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_DB_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export const envSchema = baseSchema

export type Env = z.infer<typeof envSchema>

// Deno exposes Deno.env; vitest runs on node and exposes process.env.
function readEnv(): Record<string, string | undefined> {
  const denoEnv = (globalThis as { Deno?: { env: { toObject(): Record<string, string> } } }).Deno
  return denoEnv ? denoEnv.env.toObject() : process.env
}

// Deployed functions cannot receive custom secrets named SUPABASE_* — the
// platform reserves the prefix — but it injects SUPABASE_SERVICE_ROLE_KEY.
// Map it to the name v1 used so the same code runs deployed and locally.
//
// The same reservation blocks overriding the injected SUPABASE_DB_URL, which
// points at the direct connection; the transaction-pooler URL is set under
// DB_POOLER_URL and takes precedence when present.
export function withPlatformAliases(env: Record<string, string | undefined>) {
  const withKey = env.SUPABASE_SERVICE_KEY ? env : { ...env, SUPABASE_SERVICE_KEY: env.SUPABASE_SERVICE_ROLE_KEY }
  return withKey.DB_POOLER_URL ? { ...withKey, SUPABASE_DB_URL: withKey.DB_POOLER_URL } : withKey
}

function parse(): Env {
  const result = envSchema.safeParse(withPlatformAliases(readEnv()))
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment variables:\n${issues}`)
  }
  return result.data
}

// Lazy: v1 parsed at module load, which is fine under Next's build but throws
// on import in any runtime that loads this module before config is present.
let cached: Env | undefined
export function getEnv(): Env {
  return (cached ??= parse())
}
