# Paytrace

Bank lines, SMS, email, and mandates are separate systems today. The harm — a silent price hike, a trial that became a plan, an autopay still charging after she stopped opening it — only appears when those records fail to join. Paytrace models them as **linked evidence** and lets the graph decide what is still costing you and how to stop it.

Priya Demo is invented. Arclight Bank is invented. The as-of date is 22 October 2026. The prototype shows a route to stop a payment. It never connects to a bank, and it never sends a revoke.

## Where the code lives

| Folder / file | Job |
| --- | --- |
| `app/page.tsx` | Server entry: load Neo4j or fall back to CSV, then render the shell |
| `components/dashboard.tsx` | Shell only — top bar, side nav, which screen is open |
| `components/screens/` | **One file per product screen** (01–04) |
| `components/screens/all-payments.tsx` | Screen 01 — every recurring payment |
| `components/screens/issues.tsx` | Screen 02 — silent hike, unused, trial |
| `components/screens/cancel-paths.tsx` | Screen 03 — how to stop each one |
| `components/screens/annual.tsx` | Screen 04 — the year ahead |
| `components/chrome/` | Shared chrome: evidence strip, screen header, Neo4j source panel |
| `components/detail/` | Side drawer + Evidence path (live Neo4j only) |
| `components/visualizations/` | Charts used inside the screens |
| `db/neo4j/` | Live graph: client, dataset read, Cypher analysis, schema/seed |
| `scripts/seed-neo4j.ts` | `npm run seed` — write the fixture into Aura |
| `lib/engine.ts` | Offline detection (CSV path; what the tests lock) |
| `lib/analysis.ts` | Shared filters/totals used by screens |
| `lib/types.ts` | Shared TypeScript shapes |
| `data/raw/` | Synthetic CSV fixture |

## Live mode is Neo4j

```
Neo4j Aura (seeded)  ─►  Cypher analysis  ─►  the four screens
```

Open `db/neo4j/` first: schema, seed, CSV-equivalent load, and the analysis query that decides commitments.

When Aura is configured and seeded, Cypher decides which rows are issues, what the year adds up to, and the cancel path on each row. The top bar reads **Reading Neo4j**. The strip under it shows host and node counts. Each detail panel opens an **Evidence path** — `Payment -[:PAID_TO]-> Merchant`, messages on `ABOUT`, mandates on `AUTHORIZED_BY`, and a silent hike as a stepped amount with **no** `price_change` Message.

### Run live

1. Copy `.env.example` to `.env.local` — `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`. Aura URIs (`neo4j+s://…`) work.
2. `npm install`
3. `npm run seed` — writes the fixture through the Bolt driver (Aura blocks `file:///` imports).
4. `npm run dev` — badge **Reading Neo4j**, Evidence path on every row.

`db/neo4j/load-from-csv.cypher` is the same graph for a local Neo4j that can import files.

## Offline fixture (not the scored path)

```
data/raw/*.csv  ─►  lib/engine.ts  ─►  the four screens
```

If Neo4j is missing, empty, or unreachable, the app serves the CSV so a reviewer without Aura can still click around. The badge says **Reading CSV fixture** / offline. That path exists so the prototype does not die in a zip review — it is not the live product story. The tests cover `lib/engine.ts`; live mode covers the same rules in Cypher (`db/neo4j/analyze.ts`).

### Run with local fixtures

```bash
git clone https://github.com/AdithyaPatil-1609/paytrace.git
cd paytrace
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No database or environment file is required for fixture mode. The application should display **Reading CSV fixture**.

### Run with Neo4j

After installing dependencies, create the local environment file:

```bash
cp .env.example .env.local
```

Dictionary wording lives on `Pattern`, not `Merchant`. `Merchant` is keyed by brand; Spotify and Netflix each have a plain row and a `PAYPAL *` row.

| Variable | Required for Neo4j | Description |
| --- | --- | --- |
| `NEO4J_URI` | Yes | Connection URI, such as `neo4j+s://your-instance.databases.neo4j.io`. |
| `NEO4J_USERNAME` | Yes | Database username. |
| `NEO4J_PASSWORD` | Yes | Database password. |
| `NEO4J_DATABASE` | No | Database name; defaults to `neo4j`. |

Nothing in the app names a merchant by hand. Live mode runs these rules in Cypher; the offline fixture runs them in `lib/engine.ts`:

| Step | Rule |
| --- | --- |
| Group | Narration matched against the hand-written dictionary, longest pattern wins, then grouped with the account. `PAYPAL *SPOTIFY` never collapses into `SPOTIFY`. |
| Keep | Two debits, or one debit under a live mandate. One Swiggy order and one transfer to Rahul fail both tests and are dropped. |
| Rhythm | Median gap between debits: weekly, monthly, quarterly, annual. If the gaps scatter by more than 35% of that median, the row is irregular. |
| Amount | One price is fixed. One price then another that stays is a step. Anything else is variable. |
| Year | Fixed and stepped rows project the latest charge forward; variable uses median; irregular sums what left; annual is charged once. |
| Signals | `silent_hike` when a price steps up and no price-change message exists, `trial_converted` from a trial-ending notice, `zombie` after 90 days unopened. |

The graph connects people, accounts, payments, merchants, notifications, mandates, descriptor patterns, and derived commitments:

1. **All payments** — every row with the raw bank string, the plain name, the month, the year, and the message source.
2. **Issues** — silent hike, trial conversion, unused; Spotify price history from dated debits.
3. **Cancel paths** — stop the service, stop the money, and what to do if they stay silent.
4. **Annual** — year ahead, unused part, five-way split; panel states the Cypher year when live.

## Scope and limitations

`npm test` runs 24 checks. `npm run build` produces a production build.
