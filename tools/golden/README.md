# Golden-master differential

v2 was abandoned because its domain rules were re-derived by hand and nothing
compared the result against v1. Its unit tests stayed green the whole time —
they tested v2's own logic, so an inverted ranking scale passed. This is the
check that would have caught it.

One fixture competition, seeded deterministically. v1 records every read
endpoint's response from it. v3 serves the same fixture through its Edge
Functions and is diffed against those recordings. **Byte-equal output is the
acceptance criterion.**

## The two halves

| Half | Lives in | Command |
|---|---|---|
| Record | `comphq/src/golden/capture.golden.test.ts` | `pnpm test:golden` |
| Diff | `comphq-v3/tools/parity/golden.parity.test.ts` | `pnpm test:parity` |

`expected/` holds the recordings and is committed. It is the contract between
the two repos: the diff side enumerates the directory, so an endpoint recorded
from v1 is demanded of v3 automatically rather than being forgotten.

## Building the fixture

`seed.sql` contains no `now()` and no `random()` — the output is compared byte
for byte, so the input cannot move. It exercises the cases the rules turn on:
an athlete with no division, a withdrawn athlete, DNS gaps in the scores, a
`halfWeight` workout, a workout with Part B enabled, a `lower_is_better`
workout, a heat that is deliberately *not* completed, a judge standing at a
lane no athlete occupies, equipment rows with and without a division, and
`leaderboardVisibility` deliberately absent so both of its conflicting
defaults are exercised.

```bash
PGBIN=/opt/homebrew/opt/postgresql@17/bin PGPORT=5433 pnpm db:golden
```

Drops `comphq_golden`, replays all 34 migrations plus `supabase/tests/_shim.sql`,
loads the seed. Override the name with `GOLDEN_DATABASE`.

## Recording from v1

From the **v1** repo, with the fixture built:

```bash
GOLDEN_DB_URL=postgres://<user>@localhost:5433/comphq_golden TZ=UTC \
  GOLDEN_UPDATE=1 pnpm test:golden
```

Without `GOLDEN_UPDATE=1` the same command asserts v1 still matches what was
recorded, which is what keeps the fixture and the recordings from drifting
apart. Run it that way after any change to the seed.

`TZ=UTC` is not optional: the CSV export stamps a local-time string.

## Diffing v3

From the **v3** repo, with the Edge Functions served and pointed at a database
holding the fixture. `supabase/functions/_dev/serve.ts` mounts all 21 routers
on one port, which is what the differential is normally run against:

```bash
SUPABASE_DB_URL=postgres://<user>@localhost:5433/comphq_golden?sslmode=disable \
TZ=UTC deno run --allow-net --allow-env --allow-read --allow-sys \
  --config supabase/functions/deno.json supabase/functions/_dev/serve.ts

PARITY_BASE_URL=http://127.0.0.1:54321 \
PARITY_ANON_KEY=<anon key> \
PARITY_ACCESS_TOKEN=$(pnpm -s parity:token) \
  pnpm test:parity
```

The two credentials are different things and are sent in different headers.
`PARITY_ANON_KEY` goes in `apikey` and is what the hosted gateway wants.
`PARITY_ACCESS_TOKEN` goes in `Authorization` and is a user JWT — four of the
six endpoints are public, but `equipment-summary` and `export` call
`requireCompetitionAccess`, which validates the bearer token against the real
auth server. Without a token those two return 401; with a token for a user
that is not a member they return 403. `PARITY_SLUG` overrides the slug.

The recorded file name is the endpoint name — `leaderboard.json` is served by
`GET /leaderboard` — so v3's function names have to match v1's route names.

## The parity caller

`pnpm parity:token` mints the token. It ensures a single account exists in the
hosted `comphq-test` project — `parity-golden@comphq.test`, id
`00000000-0000-4000-8000-000000000101` — and prints a fresh access token on
stdout and nothing else.

The id is fixed on both sides: the same uuid is seeded into the fixture at the
end of `seed.sql` as a `UserProfile` row plus a `CompetitionAdmin` row for
competition 1. A generated id would make the fixture depend on which run
created the account.

That membership is deliberately `role='user'` with `isSuper` false.
`requireCompetitionAccess` accepts either role, and the weaker one proves the
guard is passing on membership rather than on privilege — a super-admin
short-circuits the membership lookup entirely and would hide a broken one.

No password exists for the account. The service key mints a one-time
magic-link token and exchanges it for a session, so the repo carries no
credential and the token expires on its own.

Adding those rows does not move any recorded output: none of the six endpoints
report members. Re-running the record side in assert mode after the seed
changed is what proves that, and it is why that mode exists.

## What is normalised, and what is not

Object keys are sorted on both sides before comparison. Key order is not part
of the contract; a different driver may return columns in a different order and
that is not a port bug. Nothing else about the JSON is touched.

One field is genuinely runtime-dependent and is named explicitly rather than
silently smoothed over: the CSV's `Exported,` line holds
`Date.toLocaleString()` output, which depends on the ICU build, and Node and
Deno do not have to agree. It is **masked, not stripped** — the diff asserts
the line is present on both sides first, so a port that drops it still fails.

## Trusting the harness

Both halves were tamper-tested rather than assumed:

- Removing `halfWeight`'s `* 0.5` from v1's leaderboard turns the record side
  red on the exact totals.
- Serving the recordings back through a stub passes; changing one
  `totalPoints` fails; reversing every object's key order still passes;
  changing the `Exported` timestamp still passes; deleting the `Exported`
  line fails.
- Removing the same `* 0.5` from **v3**'s leaderboard route, with the real
  Deno server in front of the real fixture, turns the diff side red on
  `leaderboard.json` alone. That is the failure v2 shipped, caught by the
  gate that did not exist then.
