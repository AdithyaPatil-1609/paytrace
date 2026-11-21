# Live evidence graph

The seed reads synthetic CSVs through the Bolt driver. The current schema constraints and graph relationships are defined in `write.ts`. Start with the root README for setup.

| Module | Responsibility |
| --- | --- |
| `client.ts` | Connection and configured database |
| `dataset.ts` | Read source records and assemble the live dashboard response |
| `queries/commitments.ts` | Parameterized Cypher for recurring payments and issues |
| `commitment-record.ts` | Map a query row to the shared payment type |
| `analyze.ts` | Run the query with the shared rule thresholds |
| `graph.ts` | Evidence graph counts, relationship queries and findings |
| `write.ts` | Write records and connect them to merchants, accounts and mandates |
| `simulate.ts` and `challenge.ts` | Run hypothetical changes inside temporary transactions |
| `chains.ts` | FIRST / NEXT / LATEST payment chains per person and merchant, with gapDays and deltaPaise |
| `warnings.ts` | Live, profile-scoped warning queries (price, mandate, unused, upcoming, after cancellation) |
| `verify-warnings.cypher` | Read-only checks to paste into Neo4j Query Workspace |
| `remove-demo-from-personal.cypher` | Moves synthetic data out of the personal database (manual, team decision) |

`client.ts` holds two drivers: personal (`NEO4J_*`) and demo (`NEO4J_DEMO_*`). See `WARNINGS.md` for setup, schema and test coverage.
