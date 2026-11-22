# neo4j/: the graph database

Every Cypher query and database write lives here. Each person has their own graph, and every query is locked to that person.

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

## Live accounts (the personal graph)

Every query here is scoped to one person: `(:LiveProfile {id:$profile})` or their `PaytraceUser`.

| Module | Responsibility |
| --- | --- |
| `accounts.ts` | Users, sessions (rotation, idle and absolute limits) and encrypted Gmail tokens |
| `live.ts` | Store payment events from SMS, Gmail and statements, and build the person's dashboard |
| `devices.ts` | Pairing codes and paired phones (public keys only) |
| `app-usage.ts` | Android screen time matched to the person's subscriptions |
| `family.ts` | Family View invites and read-only access |
| `merchant-links.ts` | `SIMILAR` links between merchant names that may be one merchant |
| `evidence-trust.ts` | Source trust and payments confirmed by two or more channels |
| `recurring-checks.ts` | Stored local-model verdicts on repeating groups |
| `delete-user.ts` | "Delete my data": removes everything about one person in one transaction |
| `sandbox-graph.ts` | A demo visitor's private, short-lived profile |

## Aura Agent (shared, non-personal)

`agent-client.ts` is a separate connection to the Aura Agent database, and `agent-knowledge.ts` loads the public merchant catalog into it. Personal data never goes there. See `AGENT.md`.

## Other docs in this folder

- `WARNINGS.md`: setup, the demo/personal database split, schema and checks.
- `GRAPH-INTELLIGENCE.md`: SIMILAR merchants, source trust and the Cypher behind each graph query.
- `AGENT.md`: the Aura Agent knowledge database.
- `schema.cypher`, `seed.cypher`, `load-from-csv.cypher`: schema and demo loading, for the Neo4j Query Workspace.
