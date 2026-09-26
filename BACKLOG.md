# Backlog

Everything known to be wrong, or known to be owed, and not fixed. It lives in
the repository rather than in a plan file because plans are replaced when the
next one is written, and a defect ledger that disappears with its plan has to
be re-discovered by the next person to read the code.

Each open item is also locked by a test that says the behaviour is deliberate.
That is the point of the ledger: a defect that no test pins is a defect that a
later change can silently "fix" and break the parity proof with v1.

## v1 defects fixed in the redesign

| # | What was wrong | Where it is fixed |
|---|---|---|
| 15 | Two of v1's colours failed WCAG AA: white on `orange-500` at 2.89:1 against a 4.5:1 floor, and `gray-700` control borders at 1.72:1 against a 3:1 floor. | `apps/web/src/tokens/brand-comphq.css` — the Floor palette replaces both values outright. `pnpm check:tokens` re-proves every pair in the package's contrast contract. |
| 19 | The hero ignored `prefers-reduced-motion`: entrance, parallax, dust and letter-shatter are all gsap, so the CSS media query MDS declares never reached any of them. | `HeroScene.tsx:145` — `gsap.matchMedia()` with a `reduce` branch that draws the poster arrived-at rather than travelled-to. |
| 20 | `JudgeGate` resolved the password as `settings.data?.judgePassword ?? BUILT_IN`, and `data` is undefined in flight — so for the first frames of every visit the compiled-in `rug702` was a working answer whatever the competition had set. | `JudgeGate.tsx:18` — the gate waits for the read to settle; the constant survives only as the answer when the read fails. |
| 21 | `WorkoutEquipmentPopover` swallowed both its loads, so a popover that could not reach the API drew the same empty list as a workout that needs no equipment. | `WorkoutEquipmentPopover.tsx:76` |
| 22 | That popover's DELETE never read `res.ok`, so a refused removal still came off the list and was back on the next open. | `WorkoutEquipmentPopover.tsx:112` |
| 23 | Division reorder swapped rather than shifted: moving the first division to third left the old third at first. | `apps/web/src/api/divisions.ts:47`, `DivisionsSection.tsx:19` |
| 24 | The logo picker offered `image/svg+xml`, which `POST /api/logo` rejects, and v1 acted only `if (res.ok)` — so choosing an SVG appeared to do nothing at all. | `LogoSection.tsx:11` — the picker offers exactly the four types the endpoint accepts. |
| 25 | Every add form on the setup screen cleared the typed name whether or not the write landed. | `NameSheet.tsx:14` — fixed once in the shared sheet rather than at three call sites. |
| 26 | The logo cache-buster was page-local, so the header kept drawing the old logo until a reload. | `apps/web/src/api/logo.ts:39` — stamped at the call site. |
| 27 | The TV QR code was compiled in as `https://www.comphq.pro/ruggedrumble/athlete-overview`, so every board sent the room to one competition's athlete list. | `TvPage.tsx:22` — the board builds its own address. |
| 28 | Rank colours clamped, so everyone from third down was painted bronze. | `TvLeaderboardView.tsx:18` — every place carries its own number and rank is not a medal. |

## v1 defects still open, by decision

These are server-side or business behaviour, not presentation. The redesign
froze functionality, so fixing them here would have broken the thing the
golden-master differential exists to prove.

**Authorization.** The competition is protected by convention rather than by
the database.

- **1.** `GET /api/settings` returns `judgePassword` to any caller, which makes the
  judge and equipment gates a courtesy rather than a lock.
  `apps/web/src/api/settings.ts:6`
- **2.** `GET`/`PATCH /api/checks` have no auth gate at all — anyone can flip check
  state. `apps/web/src/api/checks.ts:13`,
  `supabase/functions/_routes/checks/route.test.ts:10`
- **3.** `role='user'` members can mutate athletes, workouts and scores. Only the
  `comp-users` routes use `requireCompetitionAdmin`.
  `CompetitionAdminApp.tsx:20`, `apps/web/src/api/compUsers.ts:7`
- **4.** `GET /api/competitions` is public and lists every competition on the
  install. `apps/web/src/api/competitions.ts:20`
- **5.** RLS is enabled with no write policy at all on `Volunteer`, `VolunteerRole`,
  `JudgeAssignment`, `WorkoutEquipment` and `WorkoutLocation`. Six tables are
  readable and writable only because every server call uses the service-role
  key. `supabase/tests/rls.test.sql:147`
- **10.** `GET /api/workouts/[id]/equipment` has no session gate — it resolves the
  competition from the slug and serves anyone. `POST` on the same route does
  gate. `apps/web/src/features/equipment/api.ts:12`
- **13.** `GET /api/judge-schedule` is public. Plausibly deliberate for a display
  board, but undocumented; now pinned.
  `apps/web/src/features/judges/api.ts:6`

**Correctness.**

- **6.** `POST /api/workouts/[id]/assignments` reads every `Score` row in the
  database, unscoped by competition. v1's own comment calls it intentional; it
  is a correctness hazard the moment two competitions share an install.
  `supabase/functions/_routes/workouts/[id]/assignments/route.ts:97`
- **7.** Heat regeneration includes withdrawn athletes — the athlete query filters by
  competition and nothing else.
  `supabase/functions/_routes/workouts/[id]/assignments/route.ts:84`
- **8.** The site logo is stored against `competitionId = 0`, an orphan row no
  `Competition` matches. `apps/web/src/api/logo.ts:5`
- **9.** `heats/[heatNum]/complete` reads `completedHeats` concurrently with its own
  insert, so `workoutDone` can come back false on the final heat's first call.
  `supabase/functions/_routes/workouts/[id]/heats/[heatNum]/complete/route.ts:35`
- **11.** `DELETE /api/workouts/[id]/judge-assignments` treats an unparseable body the
  same as an absent one, and an absent body means "delete every assignment for
  this workout". `apps/web/src/lib/api.ts:69`
- **12.** The CSV judge import trims every cell before rejoining a comma-bearing name,
  so a judge stored as `Doe, Jane` can never match its own exported row — the
  lookup key becomes `Doe,Jane`. The failure is reported as HTTP 200 with
  `imported: 0`, so a caller watching status codes sees success.
  `supabase/functions/_routes/import/judge-assignments/route.test.ts:74`
- **14.** An athlete who did not start most of the competition can lead it. Missing
  workouts contribute nothing to `totalPoints` and the lowest total wins, so
  in the golden fixture Finn Fox scores one of four visible workouts, totals
  6, and outranks Bob Brown on 6.5 who scored every one. There is no
  participation floor and no DNS penalty. `tools/golden/seed.sql:92`

**Latent, in a frozen file.**

- **16.** `http.ts`'s write helpers spread `init` *after* the headers object is built,
  so an `init` that carries headers replaces the `content-type` just set
  rather than adding to it, and the `...(init?.headers ?? {})` merge inside
  the object is dead whenever it would matter. Latent in v1 — none of its 46
  call sites passes headers — and latent here, because `api.ts` passes auth
  headers on every request and so sends the complete set whichever way the
  spread resolves. The file is in `VERBATIM_APP` and cannot be edited without
  leaving the parity proof. `apps/web/src/lib/http.ts:30`

**Presentation, deliberately not fixed.**

- **17.** `/admin` redirects a non-super admin using `GET /api/competitions` — the
  public list of *every* competition rather than the ones that user
  administers — and sends them to the first entry's `/{slug}/admin`. Combined
  with defect 4, a member of one competition who visits `/admin` lands on a
  stranger's competition, where the per-competition gate then refuses them.
  The correct list is `/api/competitions/mine`, which the layout already calls
  one level down. Left open because the fix changes which endpoint is called,
  which is functionality rather than presentation, and functionality was
  frozen for this pass. `AdminApp.tsx:31`, locked by `AdminApp.test.tsx:61`
- **18.** The hero's per-character spans give the poster no usable accessible name.
  `dom-accessibility-api` trims each text node before concatenating, so
  `Rugged Rumble` computes as `RuggedRumble` and a screen reader walking the
  spans reads the title letter by letter. The animation needs one element per
  character, so the fix is a visually-hidden full-text copy plus
  `aria-hidden` on the split — a markup change to a screen with no inbound
  links. `HeroScene.test.tsx:57`

## Found during the redesign

**For MDS-2, not for this app.**

- The `Switch` knob sits at roughly 1.4:1 against its own track when off, which
  is below the 3:1 a non-text boundary needs. It is a component-level value, so
  it belongs upstream; re-pointing it in the brand file would be geometry and
  colour smuggled into an app.
  Used at `CompetitionSettingsSection.tsx:61`.
- The pulsing live dot is drawn twice locally — `LiveBadge.module.css` and
  `LiveStatus.module.css` each carry their own `.dot` and `@keyframes pulse`,
  differing only in colour and in meaning (amber "running now" against green
  "still being fed"). Two copies of one idea is the shape of a component MDS
  does not have yet.

**In this repo.**

- The main chunk is 600.55 kB (175.32 kB gzipped) after the admin tree was split
  behind `lazy()`. The remaining weight is the shared spine — React, the router,
  the query client and MDS — so the next real cut is the vendor split, not
  another route.
- `browserslist: "chrome 56"`, carried over from v1 and never tested against.
  The built stylesheet carries `dvh` twice and `:is()` twice, the latter inside
  MDS `Card` padding; on Chrome 56 a card loses its inner padding and nothing
  else. Either raise the target upstream in MDS or drop the note — do not carry
  it forward untested.
- `check:tokens` did not catch the SkipLink defect, where a screen-reader-only
  box was positioned *at* `--mds-hidden-size` instead of offset by it, putting
  a focusable link a pixel from the corner of every page above everything else
  on it (`apps/web/src/layouts/SkipLink.module.css`). Every value in that file
  was a token, so the gate had nothing to object to. The gate proves that
  values come from the system; it cannot prove that a value is used for what it
  means.
- The hero poster hard-codes one competition's name and a date now in the past
  (April 25, 2026). It is the same family as defect 27, but it is content with
  no data source behind it: `/hero` has no slug, no API call and no inbound
  link, so there is nothing to read the real name and date from.
  `HeroScene.tsx:285`
- `@mond-design-system/react@6.0.0` removed `DataTable`'s card fold: reassigning
  `display` on table, row and cell elements strips their implicit ARIA roles in
  every major browser, so the table now keeps its columns at every width and
  pans inside a labelled scroll region. Two screens carried more columns than a
  375px phone can hold — the leaderboard (seven with four workouts) and athlete
  control (four, with an 11rem lead column) — and panning scrolls the cells
  every other cell is read against off the side. The leaderboard now drops its
  per-workout columns below `--mds-bp-md` and the workout switch above it is how
  a phone reads one workout; athlete control is a list of heats rather than a
  table at every width. The rule this leaves: a public or operator screen may
  not put a table on a phone that is wider than the phone. The admin tree is
  desktop-first and panning there is expected.
- Workout detail's two panes navigate rather than select — the left pane changes
  the route instead of filtering the right — because cross-heat drag needs every
  heat mounted at once. A selection model would be the better interaction and
  would cost the drag.

## Live-stack status (was: blocked on credentials)

- The e2e suite runs green against `comphq-test`: 17/17 in 5 files, last run
  2026-08-29 (`pnpm exec playwright test`). Assumes the `admin@test.local`
  super account exists in the project `.env.local` points at.
- The 21 Edge Functions are deployed to `comphq-test` and healthy
  (`/functions/v1/health` returns 200). `supabase/config.toml` is generated by
  `tools/gen-functions.mjs` and carries the per-function import map and
  `verify_jwt = false`; deploy with
  `npx supabase functions deploy --project-ref eestayvdywqiemimriqu --no-verify-jwt`.
- `comphq-test` public schema still holds empty snake_case tables (`athlete`,
  `competition`, …) from a pre-v3 experiment alongside the v3 PascalCase
  tables. Harmless but owed a wipe-and-repush
  (`pnpm db:wipe -- --confirm=… && pnpm db:push -- --confirm=…`).
- `pnpm test:parity` and `pnpm test:sql` need a live database and are not part
  of `pnpm verify` for that reason. Both green on 2026-08-29: SQL suite 62
  assertions against comphq-test; golden-master parity 6/6 byte-identical
  against the local `comphq_golden` fixture (postgres@17 on 5433, per
  `tools/golden/README.md`).
