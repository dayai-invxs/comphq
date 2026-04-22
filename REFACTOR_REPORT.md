# comphq — what we changed and why

A plain-language summary of the work on branch `audit/full-audit-mvp`. Written for someone who doesn't read code.

Four audits kicked it off — **Security**, **Bugs**, **Performance**, and **Code Structure** — plus a major auth overhaul that replaced the hand-rolled login system with Supabase Auth.

**At a glance:** 56 commits, **234 automated tests** (208 unit + 16 RLS integration + 10 end-to-end browser tests, all green), a three-role permission model (super admin / admin / athlete), and password reset by email.

---

## Security

Before this branch, anyone logged in could do anything — to any competition, not just the one they were supposed to be running. Plus a few other things you'd want fixed before taking money.

| How it was | What we changed | Why |
|---|---|---|
| Any logged-in user could read, modify, or delete data in **any** competition on the site. The app didn't check which competition you were a member of — only that you were logged in. | Formalized a three-role model (super admin / admin / athlete) with two layers of enforcement: app code checks permissions before every mutation, and database Row Level Security policies check again as a safety net. Non-members get blocked with a clear "not authorized" screen. | This is the single biggest one. It's the difference between "internal tool for you" and "something you could hand to a paying customer." |
| The default admin password was **`crossfit123`**, hardcoded in the source. Login used our own hand-rolled auth system that we had to maintain ourselves. | Replaced with Supabase Auth (email + password, email-based password reset, session management — all managed). The first super admin is promoted via a one-time SQL statement to prevent self-promotion; every subsequent user is managed through the `/admin/users` page. | Anyone reading the open-source code could have logged in as admin. Also freed us from maintaining our own auth code. |
| A logged-out attacker could tell whether a username existed by measuring how long the login page took to respond. | Login always takes the same amount of time whether the user exists or not. | Stops attackers from building a list of valid usernames to target. |
| Someone could try unlimited passwords against the login page — brute-force was trivial. | Login is now rate-limited: 5 attempts per minute per IP address. The 6th returns "too many attempts, try again later." | Standard defense against password-guessing bots. |
| Sessions never explicitly expired. Once logged in, you stayed logged in for months. | Sessions expire after 8 hours. You re-login tomorrow. | Basic hygiene for any product with admin accounts. |
| You could upload an SVG "logo" that was actually a hidden script. It would then run in any user's browser that viewed the competition page. | SVG uploads are blocked. Only real image formats are accepted. | Classic attack vector. Cheap fix, large impact. |
| The app sent no security instructions to browsers. No "block this page from being put in a frame," no "only load scripts from our own origin," etc. | Added a full set of modern security headers — Content Security Policy, HSTS, X-Frame-Options, etc. | Catches whole categories of attacks that would otherwise work. |
| The server-side database key was in a file that had no guard preventing it from accidentally being bundled into the website sent to browsers. | Added an explicit "server-only" marker. If anyone ever imports it in client code, the build fails loudly. | If that key ever leaked, a stranger would have full DB access. |
| Every request body was trusted blindly. Type mismatches produced cryptic 500 errors that leaked database internals. | Every incoming request is now validated with a schema before touching the database. Bad input gets a 400 error with a human-readable message. | Better error messages for legitimate users; no DB leaks for hostile ones. |

---

## Bugs & correctness

The scoring math was already solid. The bugs lived at the edges — where the app talks to the database, or where the UI talks to the server.

| How it was | What we changed | Why |
|---|---|---|
| If two people clicked "Complete Heat" at the same moment, one of their updates could silently overwrite the other. The list of completed heats would end up corrupt. | Each completed heat is now a row in a dedicated table, with a uniqueness rule. If two people click simultaneously, the DB itself enforces "this heat is completed exactly once." | This is the bug class that ruins weekends. Unreproducible until it happens in front of 200 people. |
| Deleting an athlete wiped every score they ever posted, with no warning. | The confirm prompt now says how many scores and heat assignments will also be deleted. | Prevents the "I meant to delete Alex, not wipe the whole weekend" class of disaster. |
| Generating heat assignments for a workout: the old assignments were deleted first, then new ones inserted. If the insert failed halfway, you had no assignments. | The whole operation is now atomic — it all succeeds, or nothing changes. No more "stuck halfway through an import." | Same class of bug, for CSV imports and regeneration. |
| Save buttons in the admin UI would stop spinning regardless of whether the server accepted the save. A session timeout looked identical to a successful save. | Added a helper that actually checks the response. Failed saves now surface an error. | Admins no longer quietly lose work they thought they'd saved. |
| The first admin user was seeded on login. Two simultaneous logins could both try to seed, and one would crash with a duplicate-key error. | The seed is now idempotent — whichever request gets there first wins, the other quietly succeeds. | Edge case, but one that looks like a "mysterious error" during boot. |
| When an admin turned off Part A/B scoring on a workout, the orphan Part B values stuck around in the database. Turning Part B back on later revived them. | Turning off Part B now clears those fields. | Stale data that used to "come back from the dead" is actually gone now. |
| The login form had a query parameter that controlled where to redirect after sign-in. An attacker could send a link that redirected to a phishing page. | The redirect is now restricted to URLs within the site. | Small but real. |

---

## Performance

The app wasn't slow today. But the math said the first real competition — 200 athletes, 300 phones refreshing the leaderboard every 10 seconds — would overwhelm the free-tier database.

| How it was | What we changed | Why |
|---|---|---|
| Every phone watching the leaderboard hit the database directly, every 10 seconds. 300 phones = ~5,400 database round trips per minute for identical data. | Added a short-lived cache in front of the public read pages. Now 300 phones hit the database maybe 12 times per minute instead of 5,400. | The difference between "database melts at 10am" and "it's fine." |
| On top of that: updates took up to 10 seconds to appear. A scorekeeper saved, and 300 phones waited up to 10s to catch up. | Added **real-time push updates**. When a score is saved, every phone sees it in under a second. Polling is still there as a backup. | This is the single biggest UX improvement. It's the one a spectator actually sees. |
| Phones in people's pockets kept polling every 10 seconds for no reason. | The updates pause automatically when the tab is in the background and resume when it's focused. | Less battery drain for athletes and spectators, less server load for you. |
| A giant automation library (`puppeteer`, ~300MB) was installed as a runtime dependency even though nothing used it. | Removed. | Faster installs, smaller deploys. |
| The logo image bypassed the optimization pipeline — full-size images every time. | Now uses the proper image optimizer, which resizes and caches. | Lower bandwidth costs; slightly faster page loads. |
| There was no way to know if the app was healthy from the outside. | Added a `/api/health` endpoint. Configure Vercel or any uptime monitor to ping it. | When something breaks at 2am, you know before a customer tells you. |

---

## Code structure (DRY / SOLID / KISS)

Mostly internal cleanup. Not visible to users, but directly affects how fast future features can ship — and how confidently.

| How it was | What we changed | Why |
|---|---|---|
| One admin page was **525 lines long with 33 separate pieces of state**. Touching anything risked breaking something else. | Split into smaller, focused pieces: a hook for loading data, a hook for score input state, and 4 smaller display components. The main page is now 189 lines of wiring. | Next time you want to add a feature to the workout detail page, you can do it in 30 minutes instead of 3 hours. |
| The scoring-ranking logic was **copy-pasted verbatim in two files**. A bug fix landing in one wouldn't land in the other. | One canonical `rankAndPersist()` function. Both places call it. | If someone fixes a tie-breaking bug, it's fixed everywhere at once. |
| The status-color map (`draft` = gray, `active` = green, `completed` = blue) was redefined in **4 different files** with slightly different colors. | One shared file. All pages import from it. | The next time you rebrand, you change one file instead of four. |
| The database types were hand-typed and drifted out of sync with the actual schema. A column added to the DB would silently disagree with the TypeScript type. | Types are now auto-generated from the database. One command regenerates them. | Prevents a whole category of "the code says X but the database says Y" bugs. |
| Database query syntax was duplicated across 5+ routes. | Extracted into one shared file. | Same reason as above. |
| The "completed heats" list for a workout was stored as a JSON-encoded string in a text column. Every read involved parsing, every write involved stringifying. | Dedicated table with proper database indexes. | The DB now enforces correctness instead of the application crossing its fingers. |
| The "per-heat time overrides" column was similarly stored as JSON text. | Migrated to a proper jsonb column. | Same reason. |

---

## Bonus things we added

A few items from the "leverage moves" list that weren't in any of the four audits but were worth doing:

- **Organizer data export (ZIP)**: admins can now download a zip file with separate CSVs for athletes, divisions, workouts, heat assignments, and scores, plus a manifest. Makes it easy to move data into a spreadsheet or another tool.
- **Keyboard-first score entry**: scorekeepers can press Enter after each score to jump to the next input. Arrow keys navigate up and down. No mouse round-trip per row.
- **End-to-end test**: an automated browser script that creates a competition, adds athletes, creates a workout, enters scores, completes the heat, and verifies the leaderboard. Runs on every build.

---

## Users, roles, and permissions

Big change on this branch: the hand-rolled login system (username + password stored in our own table) was replaced with **Supabase Auth** (email + password managed by Supabase), and the permission model was formalized into three roles.

### The three roles

| Role | Who | What they can do |
|---|---|---|
| **Super admin** | a flag on the user (`UserProfile.isSuper = true`) | Can do everything: create/rename/delete competitions, manage users, access any competition's admin area. Bypasses every membership check. |
| **Admin** | a row in `CompetitionAdmin(userId, competitionId)` | Can do everything inside a specific competition (athletes, workouts, scores, settings), but cannot create or delete competitions themselves, and cannot see other competitions they're not a member of. |
| **Athlete** | no auth required | Anyone visiting the public pages (`/{slug}`, `/{slug}/leaderboard`, `/{slug}/ops`) — no login needed. The schema has a hook (`Athlete.userId`) for a future "claim your athlete account" feature, but that's not built yet. |

### Why two tables for users?

Supabase owns its own `auth.users` table (identity, email, password, session). We can't add columns to it safely — Supabase upgrades could wipe changes. So our app-specific flag `isSuper` lives in a sibling table `UserProfile`, keyed by the same UUID. The two tables are kept in sync by a database trigger.

This is the Supabase-documented pattern — appears in four of their own starter templates.

### The /admin/users page

Super admins get a dedicated page at `/admin/users` for managing everyone. From there you can:

- **Add a user** — type their email + a password. The user is created with email confirmed (no invite email round-trip; you hand them the password directly).
- **Promote/demote super admin** — toggle the Super Admin checkbox on any user's edit panel.
- **Grant or revoke per-competition admin access** — tick which competitions each user should admin.
- **Send a password reset email** — triggers Supabase to email them a reset link. You never see their password.
- **Delete a user** — removes them from auth and cascades all their memberships.

Non-super admins don't see this page (the link isn't in their nav, and visiting `/admin/users` directly shows an access-denied screen).

### How access control is actually enforced

Two independent layers:

1. **App code** — every mutation route calls `requireCompetitionAdmin(slug)` or `requireSiteAdmin()`. Fails with 401/403/404 before touching the database.
2. **Database (RLS)** — Row Level Security policies on every protected table. Even if a route forgot to check, the DB rejects writes that don't match super-admin-or-member rules.

Two layers of the same check. If either one is forgotten or bypassed, the other still holds.

### What you get out of the box

- **Password reset by email**: user clicks "Forgot password?" on `/login`, gets a reset link via Supabase's email.
- **Session cookies**: 8-hour session, refreshed automatically as long as the tab is open.
- **Cross-tenant isolation verified end-to-end**: we have 16 database-level tests proving a comp-A admin can't touch comp-B data from any angle, and 7 browser-level tests confirming the UI redirects non-members to an access-denied screen.

---

## Testing this branch locally

This branch replaces the whole auth layer, so a few things need one-time setup on your machine before the app will run. Order matters — do these in sequence.

### 1. Check out the branch

From the repo root:

```bash
git fetch origin
git checkout audit/full-audit-mvp
```

If you want Claude Code to work on this branch with you, open the repo folder and run `claude` in the terminal — it picks up the branch automatically.

### 2. Install new dependencies

```bash
npm install
```

New packages on this branch: `@supabase/ssr` (for auth cookies), `@tanstack/react-query` (data fetching), `@supabase/supabase-js` version bump, `fflate` (ZIP export), `@vercel/analytics`.

Removed: `next-auth`, `bcryptjs`, `puppeteer`.

### 3. Environment variables

Open `.env.local`. Make sure these are present:

```
SUPABASE_URL=<your-project-url>
SUPABASE_SERVICE_KEY=<your-service-role-key>
NEXT_PUBLIC_SUPABASE_URL=<same-as-above>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

Remove these (no longer used):

```
NEXTAUTH_SECRET
NEXTAUTH_URL
ADMIN_USERNAME
ADMIN_PASSWORD
```

### 4. The database migrations are already applied

The linked Supabase project already has every migration from this branch applied (I did that as part of the work). You don't need to run `npx supabase db push` unless you're pointing the app at a fresh Supabase project.

**Heads up**: if you switch back to `main` later, the code will be out of sync with the DB — `main` expects a `User` table that no longer exists, and a `CompetitionMember.userId` that's an integer instead of a UUID. You'll get runtime errors until either (a) the branch merges into main or (b) you roll the DB back.

### 5. Create your Supabase admin user

The old `admin` / `crossfit123` default is gone. Auth now goes through Supabase Auth, so you need a real user.

1. Open the Supabase dashboard, go to **Authentication → Users → Add user**.
2. Enter your email + a password (12+ chars).
3. Check **"Auto Confirm User"** so you don't have to click a confirmation email.
4. Click **Create user**. Copy the user's UUID from the row that appears (looks like `8fb50b4a-3ee1-4247-9743-...`).

A `UserProfile` row auto-creates for them via a DB trigger (with `isSuper = false`). You now need to:

- **Promote them to super admin** so they can access `/admin`, AND
- Optionally: grant them admin access to specific competitions (not needed if they're super — super bypasses per-comp checks).

Go to **SQL Editor** and run:

```sql
-- Promote to super admin.
-- Use UPSERT in case the UserProfile row wasn't auto-created for some reason
-- (can happen if the user was added before the trigger existed).
INSERT INTO "UserProfile" (id, "isSuper")
SELECT id, true FROM auth.users WHERE email = 'your-email@example.com'
ON CONFLICT (id) DO UPDATE SET "isSuper" = true;
```

Verify it worked:

```sql
SELECT u.email, p."isSuper"
FROM auth.users u LEFT JOIN "UserProfile" p ON p.id = u.id
WHERE u.email = 'your-email@example.com';
```

Should show `isSuper = true`. Once you're super, you can add more users via the **Manage Users** page (under `/admin` in the nav) without ever needing SQL again. Promoting another user to super, granting them per-competition admin access, and sending them a password reset are all UI actions from that page.

There's already a test user in the DB from when I verified the flow — `admin@test.local` with password `crossfit123456` (already marked super). You can use that to log in, or create your own.

### Bootstrap reminder

The "first super admin must be promoted via SQL" is by design — it stops anyone from self-promoting through the UI. After that very first one, every subsequent user is managed through `/admin/users`, no SQL needed.

### 6. Start the app

```bash
npm run dev
```

Open `http://localhost:3000/login` and sign in with the email + password you just set.

### What to try

Once you're logged in as the super admin you just made, a quick tour to confirm everything works:

- **Super admin dashboard** — land on `/admin`. You should see the **Competitions** + **Manage Users** tabs at the top of the nav.
- **Manage Users** — click that tab. You should see yourself in the list with a `super` badge. Try adding a new non-super user (email + password), then give them admin access to the default competition via the Edit panel. Remove them when done.
- **Access gate test** — sign out, sign back in as the non-super user you just created. You shouldn't see `/admin` at all; you should be bounced straight to `/default/admin` (since that's the only comp they admin). Visiting `/admin` manually should show an "access required" screen.
- **Basic admin flow** — go to `/default/admin`, create a test athlete, create a test workout, generate heat assignments, enter a score, complete the heat, check the leaderboard.
- **Live leaderboard** — open `/default/leaderboard` in one browser tab, the admin workout detail in another, enter/edit a score, watch the leaderboard tab update within about a second without a refresh.
- **Forgot password** — sign out, go to `/login`, click "Forgot password?", enter your email. Check the inbox of that email address for the reset link. Click it, set a new password, confirm you can log back in with the new one.
- **Sign out** — the nav has a Sign Out link. Confirms the cookie is cleared and you bounce back to `/login`.
- **Session persistence** — sign in, close the browser, re-open it, go back to `/default/admin`. You should still be signed in (session cookie lives 8h by default).
- **The end-to-end automated tests** — run `npm run test:e2e -- --headed` to watch Claude's automated browser run through the competition + admin flows. Details in the next section.

If any of those don't work, the browser devtools Network tab + Supabase dashboard's "Logs → Auth" tab are the two places to look first.

---

## Running the end-to-end tests yourself

We added a suite of automated scripts that drive a real Chrome browser through the core flows:

- **Happy path** — log in, create a competition, add athletes, create a workout, generate heats, enter scores, complete the heat, verify the leaderboard updates.
- **Admin users** — super admin opens `/admin/users`, sees themselves, adds + deletes a throwaway user.
- **Access gates** — creates throwaway users with different roles, verifies each gets the right redirect or access-denied screen when visiting `/admin` and `/{slug}/admin`.

10 tests total, runs in about 90 seconds.

You don't need to understand the code to run them. Three ways to use them, from "show me a pretty UI" to "just tell me pass/fail."

### One-time setup (only if you haven't already)

Open a terminal, navigate to the repo folder, and run:

```bash
npm install
npx playwright install chromium
```

The first command installs the app's dependencies. The second downloads a clean copy of Chrome that Playwright uses for testing. You only need to do this once per machine.

Make sure `.env.local` exists in the repo root with the Supabase credentials. If it doesn't, copy it from wherever you got the project, or ask me.

### Option A: watch it happen in a browser window (recommended)

```bash
npm run test:e2e -- --headed
```

A real Chrome window pops up and you watch the whole test run in front of you. You'll see it navigate to the login page, type the credentials, click through to create a competition, and so on. Takes about 20 seconds.

### Option B: the interactive UI (most useful for debugging)

```bash
npm run test:e2e -- --ui
```

This opens Playwright's own UI — a sidebar with the test steps, the browser view, network requests, and screenshots at each step. You can click any step to see exactly what the page looked like at that moment. Click the play button to run the test; click individual steps to inspect them.

This is the most powerful mode if you want to actually understand what the test is doing.

### Option C: just run it and tell me if it passed

```bash
npm run test:e2e
```

No window pops up. When it finishes, the terminal prints `10 passed` in green or a failure with the error message. Fastest mode — use this if you just want confirmation that nothing is broken.

### Seeing a report after the fact

After any of the above, you can look at a detailed HTML report (with screenshots and a video of what happened) by running:

```bash
npx playwright show-report
```

This opens a page in your browser with every step and any failures. Screenshots and video are especially useful if something broke — you can see exactly where.

### If the test fails

Don't panic. The report from `npx playwright show-report` will show you which step failed and include a screenshot + video. Common reasons:

- The dev server isn't running and something's wrong with auto-starting it — try `npm run dev` in a separate terminal first, then run the test.
- The test database has stale data from a previous run — the test uses a fresh competition slug (`e2e-{timestamp}`) every run, so this is rare, but if in doubt you can delete the competition row manually.
- Something was actually broken by a change. This is the signal the test is designed to catch — time to look at what the most recent commit changed.
