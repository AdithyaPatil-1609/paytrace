# PayTrace

PayTrace brings recurring debits, merchant descriptions, messages and payment permissions together so a person can see what they pay for, why a charge was flagged and how to stop it. The demo uses synthetic records for Priya as of 22 October 2026.

## Run the prototype

Use Node.js 22 or newer. From this directory run `npm ci` and `npm run dev`, then open http://localhost:3000. The app opens on **All payments**. With no database credentials it reads the bundled CSV records.

For live Neo4j, use a dedicated demo database. The seed replaces PayTrace-labelled records in the configured database. To start the bundled local database and load it, run:

```sh
cp .env.example .env.local
docker compose up -d --wait
npm run seed
npm run dev
```

For Aura, set the connection values in `.env.local` to those of your demo instance before seeding. The header shows the active data source. Use `npm run build` and `npm start` for a production build.

## Follow a finding through the code

Start with Spotify in **Issues**. The recorded price changes from ₹119 to ₹139. PayTrace checks for a relevant notice and makes the supporting charges available in the payment drawer and on the **Evidence graph** page.

| Question | Where to look |
| --- | --- |
| Which data does the app load? | `app/page.tsx` selects live Neo4j data or the CSV fixture. `data/fixtures.ts` reads the five runtime CSVs in `data/raw/`. |
| What counts as recurring, and when is a price rise flagged? | `lib/payments/rules.ts` holds shared thresholds. `lib/payments/engine.ts` applies them to fixture records. `lib/payments/types.ts` defines the commitment returned to the UI. |
| How does the live graph reach the same decision? | `db/neo4j/queries/commitments.ts` contains the Cypher. `db/neo4j/analyze.ts` runs it, and `db/neo4j/commitment-record.ts` converts result columns into the shared commitment type. |
| Where does a finding become visible? | `components/screens/issues.tsx` uses `lib/presentation/issue-cards.ts` to group findings. `components/detail/` displays evidence, previews and cancellation guidance. |
| How is the evidence diagram built? | `components/visualizations/payment-evidence-graph.tsx` selects the payment. The adjacent `evidence/` folder separates record selection and coordinates from drawing and interaction. |
| Where do simulations run? | `data/simulation.ts` supplies the new autopay. `lib/scenarios/` prepares what-if inputs and explains results. `app/api/` routes live requests to Neo4j transactions that roll back after analysis. |

## UI organization

`components/dashboard.tsx` connects navigation to five screens, in order: All payments, Issues, Cancel paths, Annual and Evidence graph. `components/hooks/use-payment-review.ts` owns simulation state, user decisions and their effect on the annual estimate. `components/chrome/` holds shared navigation and headers.

`app/globals.css` is the stylesheet entry point. It imports the files in `app/styles/` in cascade order. Each file covers a screen, shared layout or responsive rules.

The **Simulate a new Autopay** button previews a synthetic Headspace payment. In the **Try a what-if** flow, a matching price notice can clear Spotify’s warning, while an unrelated old notice leaves it flagged. The yearly estimate reflects the charges in both scenarios.

## Repository checks

Run `npm test` for the payment engine, scenarios and evidence UI. With a seeded demo Neo4j database, run `npm run test:cypher` for live graph checks, output parity and rollback. Run `npm run lint` and `npm run typecheck` for static checks.
