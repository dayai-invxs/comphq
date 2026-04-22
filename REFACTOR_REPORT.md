# comphq — what we changed and why

A plain-language summary of the work on branch `audit/full-audit-mvp`. Written for someone who doesn't read code.

Four audits kicked it off — **Security**, **Bugs**, **Performance**, and **Code Structure**. Each audit produced a list of findings; this report maps those findings to what we actually changed, in plain English.

**At a glance:** 45 commits, 201 automated tests (all passing), the whole end-to-end flow (create comp → enter scores → show leaderboard) is tested by a browser-automation script that runs on every build.

---

## Security

Before this branch, anyone logged in could do anything — to any competition, not just the one they were supposed to be running. Plus a few other things you'd want fixed before taking money.

| How it was | What we changed | Why |
|---|---|---|
| Any logged-in user could read, modify, or delete data in **any** competition on the site. The app didn't check which competition you were a member of — only that you were logged in. | Added a "competition membership" concept. Every action now checks: "Are you a member of the competition you're trying to modify?" Non-members get blocked with a "Not authorized" error. | This is the single biggest one. It's the difference between "internal tool for you" and "something you could hand to a paying customer." |
| The default admin password was **`crossfit123`**, hardcoded in the source. | In production, the app refuses to start unless a real admin password is set in the environment variables. The dev-mode fallback still works on your laptop. | Anyone reading the open-source code could have logged in as admin. |
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

## What's still open

Not everything on the original plan is finished. Being honest about what's still pending:

- **Error tracking** (Sentry or similar): not installed. The first bug in production will be reported by a texting organizer, not by a pager. **~30 min of work, big payoff.**
- **A separate production Supabase database**: right now everything runs against the same test database we've been using during development. Before real money changes hands, stand up a prod project.
- **Competition-member invite UI**: the backend has roles and membership, but there's no admin screen yet to actually send "please join my competition" invites. A dev needs to add a row manually.
- **Atomic design refactor (COM-7)**: this audit is about 30% done. The big page was split, shared helpers were extracted, but a proper component library with design tokens is still ahead.
- **UX / accessibility audit (COM-8)**: never started.

See the branch's pull request for the full commit history and the Linear issues (COM-5, 6, 9, 10, 14, 15 all marked Done) for the detailed per-finding trail.
