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

export const envSchema = baseSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production' && !data.ADMIN_PASSWORD) {
    ctx.addIssue({
      code: 'custom',
      path: ['ADMIN_PASSWORD'],
      message: 'ADMIN_PASSWORD is required in production (no hardcoded fallback).',
    })
  }
})

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
