# Neo4j graph intelligence: setup, schema and checks

Why this file exists: it is the handover for the demo/personal database split,
the payment chains and the live warnings, so a teammate can set them up, verify
them and know what is still manual.

## What was built

| Phase | Feature | Where |
| --- | --- | --- |
| 1 | Separate drivers for the personal database (`NEO4J_*`) and the demo database (`NEO4J_DEMO_*`). Demo pages, `npm run seed`, simulations and challenges use the demo one. Accounts, Gmail and SMS use the personal one. The demo never falls back to personal data: with no demo database it shows the CSV sample, and demo settings that point at a hosted personal instance are refused. | `db/neo4j/client.ts` |
| 2 | `FIRST` / `NEXT` / `LATEST` chains per person and merchant, with `gapDays`, `deltaPaise` (integer paise) and `pctChange` on `NEXT`. Rebuilt from payments whenever the profile's revision changes, so late, older payments land in order and reruns are no-ops. | `db/neo4j/chains.ts` |
| 3 | Live, parameterized, profile-scoped Cypher: price rises ≥ 2% (notified / possibly silent / insufficient evidence), mandate limits (violation vs risk, unknown when unverified), unused ≥ 90 days (verified usage only), upcoming debits (notice-confirmed or estimated, window configurable), payments after cancellation (unexpected vs final bill vs unconfirmed). | `db/neo4j/warnings.ts`, limits in `lib/payments/rules.ts` (`GRAPH_WARNING_LIMITS`) |
| 3 | `GET /api/account/warnings` (optional `?days=1..60`) and `POST /api/account/subscription` (user-confirmed last use or cancellation). Profile comes from the session only. | `app/api/account/warnings`, `app/api/account/subscription` |
| 4 | "Warnings from your payment graph" on the Issues screen for signed-in accounts: what happened, why, money, evidence, next step; unknowns listed as unknown with a form to add facts. | `components/graph-warnings.tsx` |

Cross-source deduplication was already in place (`ingestLiveEvent` + `matchPayment`): a Gmail and an SMS copy of one debit become one `LivePayment` with two `EVIDENCED_BY` events; ambiguous matches go to review and are not merged.

## Personal graph schema (additions in bold)

```
(PaytraceUser {sub, profile})                      accounts.ts
(LiveProfile {id})-[:RECEIVED]->(LiveEvent)-[:ABOUT]->(LiveMerchant {key})
(LiveProfile)-[:HAS_PAYMENT]->(LivePayment {merchantKey, date, amountPaise, sources})
(LivePayment)-[:EVIDENCED_BY]->(LiveEvent)   (LivePayment)-[:PAID_TO]->(LiveMerchant)
**(LiveProfile)-[:HAS_SUBSCRIPTION]->(LiveSubscription {id, merchantKey, paymentCount, firstDate, latestDate,
     lastVerifiedUsageAt, usageSource, usageCoverage, cancelRequestedOn, cancelEffectiveOn, cancelConfirmed})**
**(LiveSubscription)-[:FIRST]->(LivePayment)   (LiveSubscription)-[:LATEST]->(LivePayment)**
**(LivePayment)-[:NEXT {gapDays, deltaPaise, pctChange}]->(LivePayment)**
```

New constraint and indexes: `live_subscription_id`, `live_payment_profile_merchant`, `live_event_kind_date`, `live_subscription_profile` (created automatically on first use).

## Environment variables

```
NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD / NEO4J_DATABASE                 personal (existing Aura)
NEO4J_DEMO_URI / NEO4J_DEMO_USERNAME / NEO4J_DEMO_PASSWORD / NEO4J_DEMO_DATABASE   demo (new)
```

Today the live site's demo settings point at the local Docker Neo4j on the host Mac, until a second Aura instance exists.

## Creating the second Aura instance (manual)

Aura Free allows **one free instance per account**, so the demo instance needs either a different Neo4j account (a teammate's) or a paid AuraDB Professional instance.

1. Sign in at https://console.neo4j.io with the account that will own the demo database.
2. **New instance** → **AuraDB Free** (or Professional) → name it `paytrace-demo` → **Create**.
3. Download or copy the credentials shown once: URI (`neo4j+s://xxxx.databases.neo4j.io`), username, password.
4. Wait until the instance shows **Running**.
5. Put them in `.env.local` as `NEO4J_DEMO_URI`, `NEO4J_DEMO_USERNAME`, `NEO4J_DEMO_PASSWORD`, `NEO4J_DEMO_DATABASE` (the database name shown in the console, often the instance id or `neo4j`).
6. Seed it (synthetic data only): `npm run seed`. The seed refuses to run if the demo settings point at the personal database.
7. Optional, with the team's agreement: remove the old synthetic graph from the personal database with `db/neo4j/remove-demo-from-personal.cypher` (look at step 1's counts first).

## Commands (VS Code terminal on Windows, PowerShell)

```powershell
cd paytrace
npm ci
npm run lint
npm run typecheck
npm test
npm run build
# Cypher tests against a throwaway local Neo4j (Docker Desktop running):
docker compose up -d
$env:NEO4J_URI="bolt://127.0.0.1:7687"; $env:NEO4J_USERNAME="neo4j"; $env:NEO4J_PASSWORD="paytrace-local"; $env:NEO4J_DATABASE="neo4j"
$env:NEO4J_DEMO_URI=$env:NEO4J_URI; $env:NEO4J_DEMO_USERNAME="neo4j"; $env:NEO4J_DEMO_PASSWORD="paytrace-local"; $env:NEO4J_DEMO_DATABASE="neo4j"
npm run seed
npm run test:cypher
```

Never run the Cypher tests with `NEO4J_*` pointing at the shared Aura: they write (and then delete) made-up test profiles.

## Verifying in Neo4j Query Workspace

`db/neo4j/verify-warnings.cypher` holds read-only queries: chain listing, one chain with its steps, FIRST/LATEST integrity, cross-person or cyclic NEXT (expect 0), deduplicated Gmail+SMS payments, each warning family, upcoming notices, and a separation check.

## Test coverage (brief's scenarios)

| # | Scenario | Test |
| --- | --- | --- |
| 1–3 | below 2%, exactly 2%, above 2% | `tests/cypher/warnings.test.ts` "1-3" |
| 4–5 | notified vs no notice (possibly silent / insufficient) | "4-5" |
| 6–7 | debit over verified mandate; missing mandate stays unknown | "6-7" and "a mandate far above" |
| 8–9 | verified 90-day inactivity; no usage → no unused claim | "8-9" |
| 10 | upcoming within 7 days (notice-confirmed and estimated) | "10" |
| 11 | payment after effective cancellation; final bill; mandate cancelled | "11" |
| 12 | duplicate Gmail + SMS transaction | `tests/cypher/chains.test.ts` |
| 13 | older transaction inserted into a chain | `chains.test.ts` |
| 14 | repeated sync, no duplicate nodes or relationships | `chains.test.ts` |
| 15 | two users, same merchant, full isolation | `chains.test.ts`, `warnings.test.ts` "15" |
| 16 | demo database missing or down, no personal fallback | `tests/database-separation.test.ts` |

Results at hand-over: 161 unit tests and 30 Cypher tests pass; lint, typecheck and the production build are clean.

## Limits and what is still manual

- **Second Aura instance**: not created (needs an account decision; see above). The demo currently uses local Docker on the host Mac.
- **Synthetic data in the personal Aura**: 389 demo nodes from the earlier seed are still there; removal script provided, not run.
- **Usage evidence**: the only verified source today is the person confirming it in the Issues panel. No app-usage feed exists, so most subscriptions show "Usage unavailable", by design.
- **Subscription cancellation evidence**: from the person (Issues panel) or `mandate_cancelled` messages. The email parsers do not yet read "your subscription is cancelled" emails.
- **Currency**: all payments are INR today; chains carry `currency: 'INR'` and the queries assume one currency.
- **Two Issues views**: the existing app-side Issues list (engine.ts) and the new graph panel use different evidence rules, so a rise can be "silent" in one and "announced" in the other when a notice has no amount.
- **Android device-to-user mapping** was not touched (owned by another teammate).
