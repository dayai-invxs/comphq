# Backlog

Everything known to be wrong, or known to be owed, and not fixed. It lives in
the repository rather than in a plan file because plans are replaced when the
next one is written, and a defect ledger that disappears with its plan has to
be re-discovered by the next person to read the code.

v3 has been production since 2026-09-29 and has moved on from v1 on purpose,
so the old reason for leaving a defect open — "functionality is frozen for the
v1 parity proof" — no longer holds. An item stays open now because nobody has
fixed it yet, or because it was decided to be the intended behaviour; each says
which.

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

## Fixed on 2026-11-11

| # | What was wrong | What it does now |
|---|---|---|
| 1 | `GET /api/settings` handed the judge password to any caller. | Fixed earlier (2026-11-10): only the competition's own people read it; judges check it through `POST /api/settings/judge`. |
| 2 | `PATCH /api/checks` took writes from anyone who knew the address, so anyone could tick heats walked out and take them off the TV and schedule. | Takes ticks from the competition's signed-in people, or from a judge/equipment screen carrying the token the judge password unlock hands out (`_shared/judgeToken.ts`). Changing the password retires old tokens and the screen asks again. Tick values must be the shapes the screens write. |
| 3 | `role='user'` members could change everything but users. | The role was redefined: a user runs the competition (entering scores, completing heats, workout status, starting and running a knockout), an admin sets it up (including withdrawals, clearing all scores and resetting a workout). Every write is listed with its check in `_routes/roles.test.ts`, so a new route fails until it is decided. The web hides setup from users (`lib/competitionRole.tsx`). |
| 6 | Heat generation read every `Score` row in the database. | Reads only the competition's athletes' scores. |
| 7 | Regenerating heats put withdrawn athletes back in lanes. | Withdrawn athletes are left out. |
| 8 | The site logo lived on an orphan `competitionId = 0` row. | Fixed earlier: each competition has its own logo. |
| 9 | Completing the final heat could report the workout not done. | Fixed earlier: the reads are sequential. |
| 11 | `DELETE /api/workouts/[id]/judge-assignments` deleted ids from any workout or competition, and an unreadable body deleted every assignment. | Deletes only this workout's rows and reports how many went; an unreadable body is a 400. |
| 14 | An athlete who skipped workouts could lead, because missing workouts added no points. | A completed workout with no score places the athlete last in it: one after the last of their division who scored, tied with the others who skipped (`_shared/skippedPlace.ts`). Leaderboard and CSV export agree. A running workout places nobody this way. |
| 16 | `http.ts` spread `init` after its own headers, so headers handed in replaced the content-type. | `init` goes first and its headers join the helper's. |
| 17 | `/admin` sent a member to the first competition on the install. | Fixed earlier: it reads `/api/competitions/mine`. |
| — | The public leaderboard said "No athletes or teams match" (with Clear filters) while a workout was running and nobody had scored. | Says "No standings yet". |
| — | The TV leaderboard ranked unscored athletes #1–#N at 0 points, by name. | Shows only athletes with a score; a division nobody has scored in says "No scores yet". |
| — | A score could be saved for an athlete from another competition. | 404. |
| — | The judge password check had no limit on guesses. | Ten a minute per caller and competition (`_shared/rate-limit.ts`, per warm instance). |
| — | No index served "one workout's scores". | `Score_workoutId_idx`. |
| — | Changes left no trail. | The router records every successful change by a signed-in person (`_shared/auditTrail.ts`); admins read it on the Activity page. Passwords are blanked; check ticks are not kept. |

## Still open

**Authorization.**

- **5.** RLS is enabled with no write policy on `Volunteer`, `VolunteerRole`,
  `JudgeAssignment`, `WorkoutEquipment` and `WorkoutLocation`. Every server
  call uses the service-role key, and the web never reads tables directly
  (public read policies were dropped 2026-11-10), so this is defence in depth
  rather than a hole. `supabase/tests/rls.test.sql:147`
- Every competition starts with the same judge password (`I'majudge`). Setup
  should ask for one, or generate one, when the competition is created.
- `JudgeGate` lets any signed-in person through, member or not. A non-member
  sees the screen, and the server refuses their ticks.

**By decision.**

- **4.** `GET /api/competitions` is public: it is the comphq.pro home page list.
  An unlisted competition (the Public switch on Setup) is left out of it.
- **10.** `GET /api/workouts/[id]/equipment` is public, for the floor screens,
  except for an unannounced secret workout, which needs a member.
- **13.** `GET /api/judge-schedule` is public, for the judges' board.
- Withdrawing and reinstating an athlete, clearing all of a workout's scores,
  and resetting a workout are the admin's, not the user's (decided
  2026-11-11). `_routes/roles.test.ts`

**Correctness.**

- **12.** The CSV judge import splits an unquoted `Doe, Jane` into two cells and
  trims both, so the name it looks up is `Doe,Jane` and never matches; the
  row is reported as an error under HTTP 200. Quoted names work.
  `supabase/functions/_routes/import/judge-assignments/route.ts:54`

**Code.**

- Data access is split: 13 plain create/read/update/delete routes (divisions,
  volunteers, volunteer roles, locations, athletes, workouts, equipment) use
  the Supabase client; the rest use Drizzle. Moving them means rewriting about
  1,250 lines of their tests for no change in behaviour, so it waits until one
  of them is being changed anyway.

**Presentation.**

- **18.** The hero's per-character spans give the poster no usable accessible name.
  `dom-accessibility-api` trims each text node before concatenating, so
  `Rugged Rumble` computes as `RuggedRumble` and a screen reader walking the
  spans reads the title letter by letter. The animation needs one element per
  character, so the fix is a visually-hidden full-text copy plus
  `aria-hidden` on the split. `HeroScene.test.tsx:57`

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

## Live-stack status

- CI (`.github/workflows/ci.yml`) runs lint, both type-checks, the Deno check
  of the functions, the token and function-entry checks, vitest and the build.
- The e2e suite is not in CI: it writes to the `comphq-test` project and would
  need that project's keys as GitHub secrets. Last green 2026-08-29 (17/17);
  much has changed since, so expect to update it before trusting a run.
  Assumes the `admin@test.local` super account exists in the project
  `.env.local` points at.
- `pnpm test:parity` (golden-master against v1) and `pnpm test:sql` need a live
  database. Both were green on 2026-08-29. The parity suite proves v3 matches
  v1, which v3 now deliberately does not (skipped workouts, roles, judge
  password, per-competition logos …); retire it or re-baseline it.
- `comphq-test` public schema still holds empty snake_case tables (`athlete`,
  `competition`, …) from a pre-v3 experiment alongside the v3 PascalCase
  tables. Harmless but owed a wipe-and-repush
  (`pnpm db:wipe -- --confirm=… && pnpm db:push -- --confirm=…`).
- Deploying is in `README.md`: migrations, then the (now 22) functions, then
  push to `main`.
