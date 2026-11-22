# data/

Synthetic demo data only. Nothing here comes from a real person or account. The demo follows a made-up person, Priya, as of 22 October 2026.

| File | What it is |
| --- | --- |
| `raw/statement.csv`, `notifications.csv`, `mandates.csv`, `usage.csv`, `merchant-dictionary.csv` | The five runtime CSVs: bank lines, notices, mandates, app usage and the merchant catalog (rail, cancel steps, traps) |
| `raw/expected-commitments.csv`, `not-commitments.csv`, `parser-fixtures.csv`, `coverage.csv` | What the engine should and should not find, used by tests |
| `raw/future-features.csv` | Ideas not built yet |
| `fixtures.ts` | Reads the runtime CSVs into a `Dataset` (used when no Neo4j is configured) |
| `csv.ts` | A small CSV reader, so the rows stay diffable in the repo |
| `simulation.ts` | The rows a new autopay would leave behind, for **Simulate a new Autopay** |

`npm run seed` loads these CSVs into the **demo** Neo4j database. It refuses to write to the main (personal) database.

The merchant catalog (`merchant-dictionary.csv`) is also the source for the Aura Agent knowledge graph (`npm run agent:seed`). It contains only public merchant facts, never personal data.
