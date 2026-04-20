---
name: Project context
description: compOps app overview — stack, key lessons from debugging
type: project
---

App is called **compOps** (was crossfit-comp). Competition management and athlete schedule tool.

Stack: Next.js 16.2.4 (Turbopack), React 19, Supabase (Postgres + `@supabase/supabase-js`), next-auth v4, Tailwind CSS 4. Tests: Vitest.

**Why:** Managing heats, athletes, scores, and live leaderboard for CrossFit-style competitions.

**How to apply:** When working on this codebase, treat it as Next.js 16 + React 19, not legacy Next.js. Key breaking changes already hit:
- Dynamic route handlers use `{ params }: { params: Promise<{ id: string }> }` — NOT `RouteContext<'...'>` (that type doesn't exist)
- `params` in layouts/pages is a Promise; must be awaited
- `useRouter()` from `useEffect` deps can cause infinite loops when `router.push()` is called inside the effect
- Read `node_modules/next/dist/docs/` before writing new Next.js-specific code

**DB access:** All DB queries go through `@/lib/supabase` (server-side, service-role key). Raw SQL is not used. Schema changes live in `supabase/migrations/` and are applied via `npx supabase db push`. Seed data in `supabase/seed.sql`, applied via `npx supabase db query --linked -f supabase/seed.sql`.
