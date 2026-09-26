/// <reference types="vite/client" />

// The variables the browser build needs. Typed here so a missing one is a
// compile error rather than an undefined at runtime.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Optional: where the Edge Functions answer, when that is not the project
   *  itself. Set to a `supabase functions serve` port for local development. */
  readonly VITE_FUNCTIONS_URL?: string
  /** Optional: the region the Edge Functions should execute in — the
   *  database's region, so every invocation runs next to its data. Sent as
   *  the x-region header. Leave unset for local serving. */
  readonly VITE_FUNCTIONS_REGION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
