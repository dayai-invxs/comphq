import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: '.env.local' })

// SUPABASE_DB_URL: the *direct* Postgres connection string (not the REST URL).
// Find it in Supabase dashboard → Project Settings → Database → Connection string.
// Format:
//   postgres://postgres:[PASSWORD]@db.<project-ref>.supabase.co:5432/postgres
// Or, recommended for pooling:
//   postgres://postgres.<project-ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
if (!process.env.SUPABASE_DB_URL) {
  throw new Error('SUPABASE_DB_URL is required in .env.local for drizzle-kit commands')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.SUPABASE_DB_URL },
  // Supabase internals — exclude from introspection.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
})
