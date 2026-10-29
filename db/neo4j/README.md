# db/neo4j — live evidence graph

| File | Job |
| --- | --- |
| `client.ts` | Bolt driver + env check (`NEO4J_*`) |
| `dataset.ts` | Read payments, messages, mandates, patterns from the graph |
| `analyze.ts` | Cypher that decides commitments, issues, year, cancel paths. Thresholds arrive as `$rules` from `lib/rules.ts` |
| `graph.ts` | Screen 00: label/relationship census and the three relationship findings |
| `write.ts` | Graph writers shared by the seed and Simulate |
| `simulate.ts` | Simulate new autopay inside a transaction that rolls back |
| `schema.cypher` | Constraints / labels |
| `seed.cypher` | Local Cypher seed notes |
| `load-from-csv.cypher` | Same graph for a local Neo4j that can `LOAD CSV` |

App seed (local Neo4j or Aura): `../scripts/seed-neo4j.ts` → `npm run seed`. Tests: `../tests/cypher.test.ts` → `npm run test:cypher`.
