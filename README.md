# comphq

CrossFit competition management app. Heats, athletes, scores, live leaderboard.

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Tailwind 4** (`@theme` config)
- **Supabase** — Postgres + `@supabase/supabase-js` (PostgREST, server-side only, service-role key)
- **NextAuth v4** — JWT sessions, credentials provider, bcrypt
- **Vitest** for unit tests, ~120 tests on pure libs + API routes
- **Playwright** (planned) for happy-path E2E

## Deployment target

**Vercel.** Caching, preview branches, edge middleware, and `images.remotePatterns` are designed against Vercel's runtime. Self-hosting is possible but would require replacing `unstable_cache` + `Cache-Control` with a proxy-level caching tier.

## Local setup

```bash
cp .env.example .env.local
# Fill in values (see Supabase dashboard > Project Settings > API)
npm install
npm run dev            # http://localhost:3000
```

Default admin user on an empty DB: `admin` / password from `ADMIN_PASSWORD` env (see `.env.example`).

## Env vars

See `.env.example`. Required at runtime (fails fast at boot):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` (service role, **server-only**)
- `NEXTAUTH_SECRET`
- `ADMIN_PASSWORD` (no default in production)

## Database

Migrations live in `supabase/migrations/`. Applied via the Supabase CLI against the linked project:

```bash
npx supabase login                       # one-time
npx supabase link --project-ref <ref>    # one-time
npx supabase db push                     # apply pending migrations
npx supabase db query --linked -f supabase/seed.sql   # local seed data (gitignored)
```

Generated TypeScript types live in `src/lib/db-types.ts` (regenerated via `npm run db:types`).

## Scripts

| | |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm test` | Vitest unit tests |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Typecheck |
| `npm run db:types` | Regenerate `src/lib/db-types.ts` from the linked Supabase project |

## Testing philosophy

- **TDD** — red → green → refactor. New logic / routes get a failing test first.
- **Unit tests** for pure libs (`src/lib/scoring.ts`, `heatTime.ts`, `scoreFormat.ts`) and API routes (mocked Supabase via `src/test/supabase-mock.ts`).
- **Integration tests** run against the linked Supabase project. No RLS bypass trickery — the service-role key is server-only.
- **Playwright** happy-path E2E runs the full create-comp → score → leaderboard flow.

Every PR ships only when `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

## Project structure

```
src/
  app/
    [slug]/          — per-competition routes (admin, ops, athlete-control)
    admin/           — non-competition admin (users)
    api/             — Next.js route handlers
    login/
  lib/               — pure libs + supabase client + auth
  components/        — React components
  test/              — Vitest setup + Supabase mock
supabase/
  migrations/        — Postgres DDL applied via `supabase db push`
```

## Roadmap

Audit issues + execution plan live in Linear: https://linear.app/comphq
