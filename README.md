# CompHQ

Runs CrossFit competitions: divisions, athletes and teams, workouts, heats and
lanes, judges and volunteers, score entry, the public leaderboard and schedule,
and the gym TV board. Production is <https://www.comphq.pro>.

## Layout

| Path | What it is |
| --- | --- |
| `apps/web` | The site: a Vite + React Router single-page app (Mond design system). Hosted on Vercel, which builds `main` on every push. |
| `supabase/functions` | The API: 21 Supabase Edge Functions (Deno). Each `*/index.ts` is generated; the routes live in `_routes/`, and shared code (including the Drizzle schema in `_shared/db/schema.ts`) in `_shared/`. |
| `supabase/migrations` | The database schema, as plain SQL migrations. |
| `tools` | Repo scripts: code generation, checks, database push and seed. |
| `e2e` | Playwright end-to-end tests. They write to a Supabase **test** project, never production. |

The web app never reads tables directly: every read and write goes through a
function (`/api/...` paths in the web map to `functions/v1/...`).

## Setup

Node 24 (see `.tool-versions`) and pnpm (`corepack enable`).

```sh
pnpm install
cp .env.example .env.local   # fill in the project's URL and keys
```

One `.env.local` at the repo root serves the site, the functions and the tools.

## Developing

```sh
pnpm dev             # the site, on Vite
pnpm dev:functions   # the functions, locally on Deno (needs Deno)
```

Without a local Deno, leave `VITE_FUNCTIONS_URL` unset and the site talks to the
hosted functions of the project in `.env.local`.

## Checks

CI runs all of these on every push and pull request to `main`:

```sh
pnpm lint
pnpm exec tsc --noEmit    # functions + tools; the web build runs its own tsc
pnpm check:tokens         # every CSS custom property resolves
pnpm check:functions      # generated function entry points are in sync
pnpm check:deno           # Deno's own type-check of the functions
pnpm test                 # vitest, server and web
pnpm build
```

Run vitest from the repo root (`npx vitest run apps/web/src/...`): the config
there holds both projects.

Adding a module to `supabase/functions/_shared/` needs `pnpm gen:deno`, which
adds it to the import map in `supabase/functions/deno.json`. Without it the
tests still pass but the deploy fails to bundle; `check:deno` catches it.

## Deploying

Order matters, because every function carries the shared schema and the web
expects the functions it calls:

1. **Migrations**, when there are new ones. Dry-run first:
   ```sh
   npx supabase db push --db-url "$SUPABASE_DB_URL" --dry-run
   npx supabase db push --db-url "$SUPABASE_DB_URL" --yes
   ```
   `SUPABASE_DB_URL` is the session pooler (port 5432), not the transaction
   pooler.
2. **Functions** (takes a few minutes):
   ```sh
   npx supabase functions deploy --project-ref <project-ref> \
     --no-verify-jwt --use-api --yes
   ```
   `--no-verify-jwt` because the public pages call without a session; each
   route checks its own access.
3. **Site**: push to `main`. Vercel builds it.

Deploying the site before the functions breaks quietly: request bodies are
validated with zod, which drops keys it does not know, so a new setting is
saved as nothing.

Function secrets: `DB_POOLER_URL` (the transaction pooler, port 6543), set with
`npx supabase secrets set`. Vercel needs `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` and `VITE_FUNCTIONS_REGION` (the database's region, so
functions run next to it).

Never run `pnpm db:wipe` against production.
