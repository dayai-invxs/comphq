import { z } from 'zod'

const baseSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.url().optional(),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

// Note: ADMIN_PASSWORD-required-in-production is enforced at runtime in
// src/lib/auth.ts#ensureSeedUser. Keeping it out of the schema lets
// `next build` (which sets NODE_ENV=production) succeed without a real
// password in the build environment.
export const envSchema = baseSchema

export type Env = z.infer<typeof envSchema>

function parse(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment variables:\n${issues}`)
  }
  return result.data
}

export const env: Env = parse()
