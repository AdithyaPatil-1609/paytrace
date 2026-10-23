# Paytrace

Paytrace reads one synthetic year of statements, SMS, and email and turns it into four screens: every payment with its plain name, the rows that changed or went unused, a cancel path for each one, and the year. It never connects to a bank, a phone, or a mailbox, and it never sends a revoke. It shows the path. The person still takes the step.

Priya Demo is invented. Arclight Bank is invented. The as-of date is 22 October 2026.

## Where the data comes from

```
Neo4j (when configured)  ─►  Cypher analysis  ─►  the four screens
data/raw/*.csv (fallback) ─►  lib/engine      ─►  the four screens
```

When Neo4j is up, a Cypher query decides the commitments: which rows are issues, what the year adds up to, and the cancel path on each row. The CSV fallback still detects those in `lib/engine.ts`. The tests cover that engine.

The running app says which one it used: a badge in the top bar, and a line under it when the analysis query is what the screens are showing. The annual screen states the year that query returned.

If Neo4j is configured but unreachable or empty, the app logs a warning and falls back to the CSV fixture rather than failing.

## Run it on Neo4j

1. Copy `.env.example` to `.env.local` and fill in `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`. Aura URIs (`neo4j+s://…`) work.
2. `npm install`
3. `npm run seed` — writes the fixture into the graph through the Bolt driver and prints what it wrote.
4. `npm run dev` — the badge should read **Reading Neo4j**.

`npm run seed` is used instead of `LOAD CSV` because Aura does not permit `file:///` imports. `db/neo4j/load-from-csv.cypher` is the equivalent for a local Neo4j with the CSVs in its import folder; both build the same graph.

Without a connection, skip straight to `npm run dev`. The fixture serves every screen.

## The graph

```
(:Person)-[:HOLDS]->(:Account)<-[:ON_ACCOUNT]-(:Payment)-[:PAID_TO]->(:Merchant)
                                      │                                  ▲
                                 [:NOTIFIED_BY]                    [:MATCHES]
                                      ▼                                  │
                                 (:Message)-[:ABOUT]->(:Merchant)   (:Pattern)

(:Payment)-[:AUTHORIZED_BY]->(:Mandate)-[:FOR]->(:Merchant)
(:Payment)-[:GROUPED_INTO]->(:Commitment)-[:FOR]->(:Merchant)
```

The dictionary's wording lives on `Pattern`, not `Merchant`. `Merchant` is keyed by brand, and the dictionary holds two rows each for Spotify and Netflix — the plain descriptor and the `PAYPAL *` one — so copy written onto `Merchant` would let the later row overwrite the earlier.

## What is computed, not written down

Nothing in the app names a merchant. The same rules run in Cypher when Neo4j is serving, and in `lib/engine.ts` on the CSV fallback:

| Step | Rule |
| --- | --- |
| Group | Narration matched against the hand-written dictionary, longest pattern wins, then grouped with the account. `PAYPAL *SPOTIFY` never collapses into `SPOTIFY`. |
| Keep | Two debits, or one debit under a live mandate. One Swiggy order and one transfer to Rahul fail both tests and are dropped. |
| Rhythm | Median gap between debits: weekly, monthly, quarterly, annual. If the gaps scatter by more than 35% of that median, the row is irregular, so society's uneven dates still count. |
| Amount | One price is fixed. One price then another that stays is a step. Anything else is variable, so electricity between ₹900 and ₹3,200 stays one commitment. |
| Year | Fixed and stepped rows project the latest charge forward, a variable row projects its median, an irregular row sums what actually left, and an annual row is charged once. |
| Signals | `silent_hike` when a price steps up and no price-change message exists, `trial_converted` from a trial-ending notice, `zombie` after 90 days unopened, plus variable amount, irregular interval, annual next date and obligation. |
| Split | Five buckets for what to do, four spend groups for where the money goes. |

Credits are never commitments, and YouTube's ₹1 authorisation is attached to YouTube as evidence rather than counted as its own price.

## The four screens

1. **All payments** — every row with the raw bank string, the plain name beside it, the month, the year and the message source. Simulate new autopay lives here.
2. **Issues** — the rows that changed or went unused, the Spotify price history drawn from real dated debits, and a what-if savings selector.
3. **Cancel paths** — two tracks per row, stop the service then stop the money, and a line for when the merchant never replies. A flagged row offers **Keep it**, which settles the warning, or **Cancel the autopay**, which drops the year. The loan has no revoke control.
4. **Annual** — KPI cards, a category donut, the twelve months ahead as a list, the month on the fridge door, and the year split five ways.

Any row on any screen opens a detail panel: the statement lines that proved it, the notices beside it, when the autopay started, what it has taken so far, and the sentence explaining why the grouping kept it.

## Run the demo

The **▶ Run the demo** button in the top bar plays the product end to end: a new autopay is detected, a silent price change is raised, and a forgotten autopay is put up for a decision that lands on its cancel path. Each step waits for a click.

## Export

One export, CSV only. There is no import: the fixture is the repository's own CSV, so nothing is uploaded.

## Verify

`npm test` runs 24 checks, including the brief's nine and the visualization guide's acceptance criteria: the year totals ₹1,99,138, the unused part ₹27,936, the Spotify hike reads +₹20 a month and 16.8%, the twelve-month forecast sums back to the year, and no unconfirmed date is ever plotted. `npm run build` produces a production build.
