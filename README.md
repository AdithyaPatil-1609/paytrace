# Paytrace

Bank lines, SMS, email, and mandates are separate systems today. The harm — a silent price hike, a trial that became a plan, an autopay still charging after she stopped opening it — only appears when those records fail to join. Paytrace models them as **linked evidence** in Neo4j, and the finding is often an edge that is *missing*: Spotify's price steps from ₹119 to ₹139, twelve Messages are `ABOUT` Spotify, and none of them is a `price_change`.

Priya Demo is invented. Arclight Bank is invented. The as-of date is 22 October 2026. The prototype shows a route to stop a payment. It never connects to a bank, and it never sends a revoke.

## The graph comes first

```
(:Payment)-[:PAID_TO]->(:Merchant)<-[:ABOUT]-(:Message)
(:Payment)-[:AUTHORIZED_BY]->(:Mandate)-[:FOR]->(:Merchant)
(:Pattern)-[:MATCHES]->(:Merchant)
(:Payment)-[:NOTIFIED_BY]->(:Message)
(:Person)-[:HOLDS]->(:Account)<-[:ON_ACCOUNT]-(:Payment)
```

Live mode opens on **Screen 00 · Evidence graph**, before any product screen. It reads the graph itself:

- what the graph holds, by label and relationship type;
- the Spotify neighbourhood, drawn from its real nodes, with the absent `price_change` Message shown as a dashed edge;
- three findings that are relationship patterns, each with the Cypher that ran:
  - a price that stepped up and stayed, on a merchant no `price_change` Message is `ABOUT`;
  - a `trial_ending` Message chained to the first paid debit, with the ₹1 hold kept out of the price;
  - a live `Mandate` `FOR` a merchant unopened for 90+ days, and the **₹24,341** `PAID_TO` those merchants since their last open.

Screen 00 has no CSV version. Offline, it says there is no graph to read and how to start one.

### Why it isn't a subscription finder

Subscription finders typically list recurring debits found in the bank feed. Paytrace's findings exist only where sources fail to join, and "how to stop it" is two paths in the graph: the service (cancel copy on the `Pattern`) and the money (the `Mandate`). Cancelling one does not stop the other.

## Run it live — no Aura account needed

```bash
git clone https://github.com/AdithyaPatil-1609/paytrace.git
cd paytrace
npm ci
docker compose up -d          # Neo4j 5.26 on bolt://localhost:7687
cp .env.example .env.local    # the local block matches docker-compose.yml
npm run seed                  # writes the fixture into the graph
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The badge reads **Reading Neo4j** and the app opens on Screen 00.

Without Docker, `brew install neo4j`, then `neo4j-admin dbms set-initial-password paytrace-local` and `neo4j start` gives the same server. For Aura, use the commented block in `.env.example`. Aura blocks `file:///` imports, so `npm run seed` writes through the Bolt driver instead.

| Variable | Required | Description |
| --- | --- | --- |
| `NEO4J_URI` | Yes | `bolt://localhost:7687` locally, or `neo4j+s://…databases.neo4j.io` on Aura. |
| `NEO4J_USERNAME` | Yes | Database username. |
| `NEO4J_PASSWORD` | Yes | Database password. |
| `NEO4J_DATABASE` | No | Defaults to `neo4j`. |

## One rule book, two runners

Live mode decides everything in Cypher (`db/neo4j/analyze.ts`): which rows are commitments, the issues, the year, and each cancel path. That includes **Simulate**, which writes the new autopay into Neo4j inside a transaction, runs the analysis query, and rolls back. The TypeScript engine (`lib/engine.ts`) runs only on the offline CSV fixture.

The two cannot drift apart quietly:

- **One rule book.** Thresholds, ids, and sentences live in `lib/rules.ts`. The engine imports it, and the Cypher query receives it as `$rules`, so no number is written twice.
- **Parity is a test.** `npm run test:cypher` asserts Cypher and the TypeScript engine return the same commitments, field by field — on the fixture, with the PayPal parser rows, and with Simulate.
- **CI runs it.** `.github/workflows/ci.yml` starts a Neo4j container, seeds it, and fails the build unless the Cypher suite passes. A skipped suite counts as a failure.

| Step | Rule |
| --- | --- |
| Group | Narration matched against the hand-written dictionary, longest pattern wins, then grouped with the account. `PAYPAL *SPOTIFY` never collapses into `SPOTIFY`. |
| Keep | Two debits, or one debit under a live mandate. One Swiggy order and one transfer to Rahul fail both tests and are dropped. |
| Rhythm | Median gap between debits: weekly ≤ 10 days, monthly ≤ 45, quarterly ≤ 135, else annual. Gaps that scatter by more than 35% of the median make the row irregular. |
| Amount | One price is fixed. One price, then another that stays, is a step. Anything else is variable. |
| Year | Fixed and stepped rows project the latest charge forward; variable uses the median; irregular sums what left; annual is charged once. |
| Signals | `silent_hike` when a price steps up and no price-change message exists, `trial_converted` from a trial-ending notice, `zombie` after 90 days unopened. |

## Tests

| Command | What it locks |
| --- | --- |
| `npm test` | 27 checks on the offline engine and the screen maths (`tests/analysis.test.ts`). No database. |
| `npm run test:cypher` | 14 checks on a seeded Neo4j (`tests/cypher.test.ts`): the nine core rules asked of Cypher directly, parity with the offline engine, PayPal descriptors, Simulate with rollback, `$rules` reaching the query, and the Screen 00 findings. Skipped, not passed, without `NEO4J_*`. |
| `npm run lint` / `npm run typecheck` / `npm run build` | ESLint, `tsc --noEmit`, production build. |
| `npm run demo` | Records the live walkthrough to `work/demo/` and fails if the app is on the CSV fixture. See [docs/DEMO.md](docs/DEMO.md). |

## Offline fixture (not the scored path)

```
data/raw/*.csv  ─►  lib/engine.ts  ─►  Screens 01–04
```

If Neo4j is missing, empty, or unreachable, the app serves the CSV so a reviewer can still click through Screens 01–04. The badge says **Reading CSV fixture**, and the strip under it says why. `npm ci && npm run dev` with no `.env.local` runs this mode.

## The screens

0. **Evidence graph** — the graph itself and three relationship findings (live only).
1. **All payments** — every row with the raw bank string, the plain name, the month, the year, and the message source. Open any row for its **Evidence path**: `Payment -[:PAID_TO]-> Merchant`, Messages on `ABOUT`, the Mandate on `AUTHORIZED_BY`.
2. **Issues** — silent hike, trial conversion, unused; Spotify price history from dated debits.
3. **Cancel paths** — stop the service, stop the money, and what to do if they stay silent.
4. **Annual** — year ahead, unused part, five-way split; the panel states the Cypher year when live.

## Where the code lives

| Folder / file | Job |
| --- | --- |
| `app/page.tsx` | Server entry: load Neo4j or fall back to CSV, then render the shell |
| `app/api/simulate/route.ts` | Live Simulate: Cypher in a rolled-back transaction |
| `components/dashboard.tsx` | Shell only — top bar, side nav, which screen is open |
| `components/screens/` | One file per screen: `evidence-graph.tsx` (00), then 01–04 |
| `components/chrome/` | Shared chrome: evidence strip, screen header, Neo4j source panel |
| `components/detail/` | Side drawer + Evidence path (live Neo4j only) |
| `components/visualizations/` | Charts used inside the screens |
| `db/neo4j/analyze.ts` | The Cypher that decides commitments |
| `db/neo4j/graph.ts` | Screen 00's relationship queries |
| `db/neo4j/write.ts` | Graph writers shared by the seed and Simulate |
| `db/neo4j/simulate.ts` | Simulate inside a transaction that rolls back |
| `db/neo4j/` (rest) | Driver, dataset read, schema, CSV-equivalent load |
| `scripts/seed-neo4j.ts` | `npm run seed` |
| `scripts/demo-live.ts` | `npm run demo` |
| `lib/rules.ts` | The rule book both engines read |
| `lib/engine.ts` | Offline detection (CSV path) |
| `lib/analysis.ts` | Shared filters and totals used by the screens |
| `data/raw/` | Synthetic CSV fixture |
| `docker-compose.yml` | Local Neo4j |
| `docs/DEMO.md` | Video shot list, deck order, positioning |
