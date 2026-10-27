# db/neo4j — live evidence graph

| File | Job |
| --- | --- |
| `client.ts` | Bolt driver + env check (`NEO4J_*`) |
| `dataset.ts` | Read payments, messages, mandates, patterns from the graph |
| `analyze.ts` | Cypher that decides commitments, issues, year, cancel paths |
| `schema.cypher` | Constraints / labels |
| `seed.cypher` | Local Cypher seed notes |
| `load-from-csv.cypher` | Same graph for a local Neo4j that can `LOAD CSV` |

App seed for Aura: `../scripts/seed-neo4j.ts` → `npm run seed`.
