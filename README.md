# Paytrace

A recurring-payment visibility prototype that connects bank statements, payment notifications, and mandates to explain what will leave an account, what needs attention, and how to stop a payment.

**Project status:** Prototype using synthetic data. No real bank, mailbox, or phone integrations. No payments or mandate revocations are executed.

## Problem statement

People set up autopay once and then lose track of it. Bank apps show cryptic lines such as `PAYPAL *SPOTIFY`. Prices increase without a corresponding notice, free trials become paid plans, and unused apps continue charging every month. Cancelling a service and revoking its payment permission are separate actions, with evidence spread across bank statements, SMS or email notifications, and the mandate that authorised the debit.

Paytrace is designed for people with UPI Autopay, recurring card charges, or standing bank instructions who need a clear view of these commitments without manually reconstructing a year of transactions. It joins these sources in Neo4j to identify recurring payments, flag potential issues such as silent price increases or unused plans, project annual costs, and explain the cancellation steps for each payment mechanism. Synthetic usage records provide the evidence for unused-plan flags.

The prototype uses one fictional person, **Priya Demo**, and one fictional bank, **Arclight Bank**. Calculations use a fixed reference date of **22 October 2026**. Paytrace shows the cancellation path; the person still takes the action.

## Features

- **Payment discovery:** Groups recurring debits and translates supported bank descriptors using a merchant dictionary.
- **Issue detection:** Flags price increases without a matching notice, trial conversions, and plans with recorded inactivity.
- **Annual forecasting:** Projects commitments and separates subscriptions, variable bills, irregular payments, and debt.
- **Cancellation guidance:** Shows separate steps for stopping a service and its payment permission, including instructions for an unresponsive merchant.
- **Evidence inspection:** Links payment details to supporting statement lines, notifications, and mandate information.
- **Interactive scenarios:** Simulates a new autopay and reflects prototype keep or cancel decisions across pages.
- **CSV export:** Downloads the currently active commitments.

## Pages

| Page | Route | Purpose |
| --- | --- | --- |
| All payments | `/` | View recurring payments, inspect evidence, and simulate a new autopay. |
| Issues | `/issues` | Review flagged payments, price history, and potential savings. |
| Cancel paths | `/cancel-paths` | Review cancellation instructions and record prototype decisions. |
| Annual | `/annual` | Explore annual totals, spending categories, and payment calendars. |

Each page supports direct navigation and browser history. The shared layout retains simulation and payment decisions during navigation. A full reload starts a fresh prototype session and reloads the data source.

## Technology stack

| Area | Technology |
| --- | --- |
| Application | Next.js App Router, React, TypeScript |
| Graph storage and analysis | Neo4j, Cypher, Neo4j JavaScript driver |
| Local data | CSV fixtures with a TypeScript detection engine |
| Styling and charts | CSS, React components, SVG |
| Validation | Node.js test runner, tsx, ESLint, TypeScript |

Dependency versions are defined in `package.json` and locked in `package-lock.json`.

## Quick start

### Prerequisites

- Node.js **20.9 or later**, as required by the installed Next.js version.
- npm.
- Git to clone the repository.
- A Neo4j instance only if you want to run graph-backed analysis.

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

Set the following values for your instance:

| Variable | Required for Neo4j | Description |
| --- | --- | --- |
| `NEO4J_URI` | Yes | Connection URI, such as `neo4j+s://your-instance.databases.neo4j.io`. |
| `NEO4J_USERNAME` | Yes | Database username. |
| `NEO4J_PASSWORD` | Yes | Database password. |
| `NEO4J_DATABASE` | No | Database name; defaults to `neo4j`. |

**Use a dedicated demo database.** The seed script deletes existing nodes carrying Paytrace's labels (`Person`, `Account`, `Payment`, `Message`, `Mandate`, `Merchant`, `Pattern`, and `Commitment`) and their relationships before loading the fixture. It can affect unrelated records that use those labels.

```bash
npm run seed
npm run dev
```

The application should display **Reading Neo4j**. Restart the development server after changing connection settings. Keep real credentials in `.env.local`, which is excluded from Git.

The seed script loads data through the Neo4j driver and supports Aura connections. `db/neo4j/load-from-csv.cypher` provides an alternative for a local database configured with the CSV files in its import directory.

## Architecture

```text
Synthetic statements + notifications + mandates + usage + merchant dictionary
                                  |
                   +--------------+--------------+
                   |                             |
             npm run seed                 Local CSV fixtures
                   |                             |
             Neo4j graph                  lib/engine.ts
                   |                             |
             Cypher analysis              TypeScript analysis
                   |                             |
                   +--------------+--------------+
                                  |
                         Shared dashboard state
                                  |
                  Payments / Issues / Cancel paths / Annual
```

When configured and reachable, Neo4j supplies the dataset and analysed commitments. Otherwise, the application reads `data/raw/` and detects commitments locally. An empty graph or a database connection failure also triggers the CSV fallback. The interface identifies the active source so a fallback is visible.

The graph connects people, accounts, payments, merchants, notifications, mandates, descriptor patterns, and derived commitments:

```text
(Person)-[:HOLDS]->(Account)<-[:ON_ACCOUNT]-(Payment)-[:PAID_TO]->(Merchant)
(Payment)-[:NOTIFIED_BY]->(Message)-[:ABOUT]->(Merchant)
(Payment)-[:AUTHORIZED_BY]->(Mandate)-[:FOR]->(Merchant)
(Payment)-[:GROUPED_INTO]->(Commitment)-[:FOR]->(Merchant)
(Pattern)-[:MATCHES]->(Merchant)
```

Descriptor-specific wording and cancellation guidance live on `Pattern` nodes. This allows multiple descriptors for the same merchant to retain their own meaning.

### Detection and forecasting

The application uses explicit rules and a maintained merchant dictionary. It does not use a trained model to infer merchant identities.

| Stage | Behaviour |
| --- | --- |
| Descriptor matching | Uses the longest matching dictionary pattern and groups payments by account and descriptor. |
| Recurrence detection | Requires at least two debits, or one debit supported by a matching mandate record. |
| Cadence detection | Uses gaps between payment dates to classify weekly, monthly, quarterly, annual, or irregular commitments. |
| Amount classification | Distinguishes fixed charges, sustained price changes, and variable amounts. |
| Annual projection | Uses the latest fixed or stepped charge, the median variable charge, observed irregular spending, or one annual charge. |
| Issue detection | Checks price changes against available notices, trial-ending notices against recurring payments, and usage records against a 90-day inactivity threshold. |

Credits, excluded purchases, and small authorisation holds are not counted as recurring costs. Variable bills and irregular payment dates remain valid commitments rather than being automatically labelled as waste.

## Development and validation

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Compile and type-check a production build. |
| `npm start` | Serve the production build; run `npm run build` first. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run the fixture-based analysis tests. |
| `npm run seed` | Replace Paytrace-labeled graph data with the synthetic fixture. |

Run the standard checks before submitting changes:

```bash
npm run lint
npm test
npm run build
```

The current suite contains **27 tests** covering recurrence detection, descriptor separation, annual projections, issue flags, simulation, and decision handling. Fixture reference values include:

| Check | Expected value |
| --- | --- |
| Annual commitments | ₹1,99,138 |
| Annual cost of unused plans | ₹27,936 |
| Spotify price increase | ₹119 → ₹139 per month; +₹20, approximately 16.8% |
| Annual commitments after the new-autopay simulation | ₹2,02,726 |

These are synthetic fixture expectations, not results from a live financial account. The test suite validates local analysis; it does not establish parity with a running Neo4j instance or replace browser testing.

## Project structure

```text
app/                       Routes, layouts, metadata, and global styles
  (dashboard)/             Shared dashboard layout and four page routes
components/
  dashboard.tsx            Shared state, navigation, export, and evidence UI
  pages/                   Page-specific content
  visualizations/          Forecast, calendar, price, and savings views
data/
  raw/                     Synthetic CSV inputs and reference fixtures
  simulation.ts            New-autopay scenario
db/neo4j/                  Driver, graph loading, schema, and Cypher analysis
lib/                       CSV parsing, detection, analysis, formatting, and types
scripts/seed-neo4j.ts       Demo graph seed script
tests/analysis.test.ts      Analysis regression tests
```

## Scope and limitations

- All bundled financial records and usage data are synthetic. There is no live transaction ingestion or user-facing upload flow.
- Keep and cancel actions change in-memory prototype state. They do not update bank mandates, cancel services, or persist across a full reload.
- A missing price-change notice means no notice was found in the supplied dataset; it does not establish that a merchant never sent one.
- Usage flags depend on the supplied usage records. Payment history alone cannot establish whether someone uses a service.
- Forecasts are estimates based on observed patterns. Irregular payments have no confirmed next payment date.
- Loans have no revoke control in the interface. Other obligations include mechanism-specific guidance; stopping a debit does not remove the underlying amount owed.
- The repository is a demonstration, not a production service for handling real financial data.